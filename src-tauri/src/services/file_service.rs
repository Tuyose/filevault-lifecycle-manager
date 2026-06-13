use std::path::{Path, PathBuf};

use sqlx::SqlitePool;

use crate::core::scanner::{ScanSummary, Scanner};
use crate::db::repositories::file_repository::{FileRepository, FileStats};
use crate::errors::AppResult;

/// Coordinates file-related operations across repositories. Owns the
/// scanner and the file repository, and hands commands a single
/// dependency to talk to.
#[derive(Clone)]
pub struct FileService {
    pool: SqlitePool,
    files: FileRepository,
    db_path: PathBuf,
}

impl FileService {
    /// Create a service with no DB-path skip-set. The scanner will
    /// not automatically exclude any files on disk. Prefer
    /// `with_db_path` in production.
    pub fn new(pool: SqlitePool) -> Self {
        let files = FileRepository::new(pool.clone());
        Self {
            pool,
            files,
            db_path: PathBuf::new(),
        }
    }

    /// Construct a service that knows about a database on disk so the
    /// scanner can skip the SQLite file and its WAL sidecars.
    pub fn with_db_path(pool: SqlitePool, db_path: PathBuf) -> Self {
        let files = FileRepository::new(pool.clone());
        Self {
            pool,
            files,
            db_path,
        }
    }

    pub fn repository(&self) -> &FileRepository {
        &self.files
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    pub async fn scan(&self, root: &Path) -> AppResult<ScanSummary> {
        let mut scanner = Scanner::new(self.files.clone());
        if !self.db_path.as_os_str().is_empty() {
            // Skip the database file itself plus any WAL sidecars.
            scanner = scanner.with_skip_paths(sidecar_paths(&self.db_path));
        }
        scanner.scan(root).await
    }

    pub async fn aggregate_stats(&self) -> AppResult<FileStats> {
        self.files.aggregate_stats().await
    }

    pub async fn tracked_file_count(&self) -> AppResult<i64> {
        self.files.count().await
    }
}

/// Build the list of SQLite file paths that should be excluded from
/// scans: the main `.db` plus the `-wal` and `-shm` sidecars.
fn sidecar_paths(db_path: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    out.push(db_path.to_path_buf());

    let wal = with_suffix(db_path, "-wal");
    if wal != *db_path {
        out.push(wal);
    }
    let shm = with_suffix(db_path, "-shm");
    if shm != *db_path {
        out.push(shm);
    }
    out
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut s = path.as_os_str().to_owned();
    s.push(suffix);
    PathBuf::from(s)
}
