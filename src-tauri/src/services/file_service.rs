use std::path::{Path, PathBuf};
use std::sync::Arc;

use sqlx::SqlitePool;

use crate::core::scan_controller::ScanController;
use crate::core::scanner::{ProgressCallback, ScanSummary, Scanner};
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
    pub fn new(pool: SqlitePool) -> Self {
        let files = FileRepository::new(pool.clone());
        Self {
            pool,
            files,
            db_path: PathBuf::new(),
        }
    }

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

    /// Scan with a progress callback and optional controller for
    /// pause/cancel support. The callback is invoked after every
    /// processed file so the UI gets live updates.
    pub async fn scan_with_progress(
        &self,
        root: &Path,
        on_progress: ProgressCallback,
        controller: Option<Arc<ScanController>>,
    ) -> AppResult<ScanSummary> {
        let mut scanner = Scanner::new(self.files.clone());
        if !self.db_path.as_os_str().is_empty() {
            scanner = scanner.with_skip_paths(sidecar_paths(&self.db_path));
        }
        scanner = scanner.with_progress_callback(on_progress);
        if let Some(ctrl) = controller {
            scanner = scanner.with_controller(ctrl);
        }
        scanner.scan(root).await
    }

    /// Scan without progress (used from tests).
    pub async fn scan(&self, root: &Path) -> AppResult<ScanSummary> {
        let noop: ProgressCallback = Box::new(|_| {});
        self.scan_with_progress(root, noop, None).await
    }

    pub async fn aggregate_stats(&self) -> AppResult<FileStats> {
        self.files.aggregate_stats().await
    }

    pub async fn tracked_file_count(&self) -> AppResult<i64> {
        self.files.count().await
    }
}

fn sidecar_paths(db_path: &Path) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
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
