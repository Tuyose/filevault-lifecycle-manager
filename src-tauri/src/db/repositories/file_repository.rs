use sqlx::SqlitePool;

use crate::errors::AppResult;
use crate::models::file_record::{FileRecord, FileStatus};

/// Data-access layer for the `files` table.
///
/// Repositories stay free of business logic; they're thin wrappers that
/// keep SQL close to the type it hydrates. Business rules belong in
/// `services/`.
#[derive(Clone)]
pub struct FileRepository {
    pool: SqlitePool,
}

impl FileRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn count(&self) -> AppResult<i64> {
        let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM files")
            .fetch_one(&self.pool)
            .await?;
        Ok(row.0)
    }

    pub async fn find_by_id(&self, id: &str) -> AppResult<Option<FileRecord>> {
        let row: Option<FileRecordRow> =
            sqlx::query_as("SELECT * FROM files WHERE id = ?")
                .bind(id)
                .fetch_optional(&self.pool)
                .await?;
        Ok(row.map(FileRecord::from))
    }

    pub async fn list_by_status(&self, status: FileStatus) -> AppResult<Vec<FileRecord>> {
        let rows: Vec<FileRecordRow> = sqlx::query_as(
            "SELECT * FROM files WHERE status = ? ORDER BY last_seen_at DESC",
        )
        .bind(status.as_str())
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(FileRecord::from).collect())
    }
}

/// Raw row mirroring the `files` table. Kept private to this module so
/// callers always go through the public methods above.
#[derive(sqlx::FromRow)]
struct FileRecordRow {
    id: String,
    original_path: String,
    current_path: String,
    file_name: String,
    extension: Option<String>,
    size_bytes: i64,
    hash: Option<String>,
    status: String,
    created_at: chrono::DateTime<chrono::Utc>,
    modified_at: Option<chrono::DateTime<chrono::Utc>>,
    last_seen_at: chrono::DateTime<chrono::Utc>,
    archived_at: Option<chrono::DateTime<chrono::Utc>>,
    trashed_at: Option<chrono::DateTime<chrono::Utc>>,
    deleted_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl From<FileRecordRow> for FileRecord {
    fn from(row: FileRecordRow) -> Self {
        let status = FileStatus::from_db(&row.status).unwrap_or(FileStatus::Active);
        Self {
            id: row.id,
            original_path: row.original_path,
            current_path: row.current_path,
            file_name: row.file_name,
            extension: row.extension,
            size_bytes: row.size_bytes,
            hash: row.hash,
            status,
            created_at: row.created_at,
            modified_at: row.modified_at,
            last_seen_at: row.last_seen_at,
            archived_at: row.archived_at,
            trashed_at: row.trashed_at,
            deleted_at: row.deleted_at,
        }
    }
}
