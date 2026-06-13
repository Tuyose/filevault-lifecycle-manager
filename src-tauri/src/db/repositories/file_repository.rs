use chrono::{DateTime, Utc};
use sqlx::{Row, SqlitePool};

use crate::errors::{AppError, AppResult};

/// Data-access layer for the `files` table.
///
/// Repositories stay free of business logic; they're thin wrappers that
/// keep SQL close to the type it hydrates. Business rules belong in
/// `services/`.
#[derive(Clone)]
pub struct FileRepository {
    pool: SqlitePool,
}

/// Inputs the scanner hands the repository for each discovered file.
/// Keeping it small and `Clone`-able makes it easy to move across
/// async boundaries.
#[derive(Debug, Clone)]
pub struct FileUpsert {
    pub id: String,
    pub original_path: String,
    pub current_path: String,
    pub file_name: String,
    pub extension: Option<String>,
    pub size_bytes: i64,
    pub created_at: DateTime<Utc>,
    pub modified_at: Option<DateTime<Utc>>,
    pub last_seen_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UpsertOutcome {
    Inserted,
    Updated,
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

    pub async fn find_by_original_path(
        &self,
        original_path: &str,
    ) -> AppResult<Option<FileRecord>> {
        let row: Option<FileRecordRow> = sqlx::query_as(
            "SELECT * FROM files WHERE original_path = ? AND status != 'deleted' LIMIT 1",
        )
        .bind(original_path)
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

    /// Insert a new file row, or update an existing one identified by
    /// `original_path`. Returns which branch was taken.
    pub async fn upsert(&self, file: &FileUpsert) -> AppResult<UpsertOutcome> {
        let existing = self.find_by_original_path(&file.original_path).await?;

        match existing {
            None => {
                self.insert(file).await?;
                Ok(UpsertOutcome::Inserted)
            }
            Some(existing) => {
                self.update_metadata(
                    &existing.id,
                    &file.current_path,
                    file.size_bytes,
                    file.modified_at,
                    file.last_seen_at,
                )
                .await?;
                Ok(UpsertOutcome::Updated)
            }
        }
    }

    async fn insert(&self, file: &FileUpsert) -> AppResult<()> {
        let result = sqlx::query(
            r#"
            INSERT INTO files
                (id, original_path, current_path, file_name, extension,
                 size_bytes, hash, status,
                 created_at, modified_at, last_seen_at,
                 archived_at, trashed_at, deleted_at)
            VALUES (?, ?, ?, ?, ?, ?, NULL, 'active', ?, ?, ?, NULL, NULL, NULL)
            "#,
        )
        .bind(&file.id)
        .bind(&file.original_path)
        .bind(&file.current_path)
        .bind(&file.file_name)
        .bind(&file.extension)
        .bind(file.size_bytes)
        .bind(file.created_at)
        .bind(file.modified_at)
        .bind(file.last_seen_at)
        .execute(&self.pool)
        .await;

        match result {
            Ok(_) => Ok(()),
            Err(sqlx::Error::Database(db_err)) if db_err.is_unique_violation() => {
                // Lost an upsert race; the other writer inserted, retry as update.
                if let Some(existing) =
                    self.find_by_original_path(&file.original_path).await?
                {
                    self.update_metadata(
                        &existing.id,
                        &file.current_path,
                        file.size_bytes,
                        file.modified_at,
                        file.last_seen_at,
                    )
                    .await?;
                    Ok(())
                } else {
                    Err(AppError::Database(sqlx::Error::Database(db_err)))
                }
            }
            Err(err) => Err(AppError::Database(err)),
        }
    }

    async fn update_metadata(
        &self,
        id: &str,
        current_path: &str,
        size_bytes: i64,
        modified_at: Option<DateTime<Utc>>,
        last_seen_at: DateTime<Utc>,
    ) -> AppResult<()> {
        sqlx::query(
            r#"
            UPDATE files
            SET current_path = ?,
                size_bytes   = ?,
                modified_at  = ?,
                last_seen_at = ?
            WHERE id = ?
            "#,
        )
        .bind(current_path)
        .bind(size_bytes)
        .bind(modified_at)
        .bind(last_seen_at)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Aggregate stats for the dashboard / scan summary.
    pub async fn aggregate_stats(&self) -> AppResult<FileStats> {
        let row = sqlx::query(
            r#"
            SELECT
                COUNT(*)                              AS total,
                COALESCE(SUM(size_bytes), 0)          AS total_bytes,
                SUM(CASE WHEN status = 'active'   THEN 1 ELSE 0 END) AS active_count,
                SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archived_count,
                SUM(CASE WHEN status = 'trashed'  THEN 1 ELSE 0 END) AS trashed_count,
                SUM(CASE WHEN status = 'deleted'  THEN 1 ELSE 0 END) AS deleted_count
            FROM files
            "#,
        )
        .fetch_one(&self.pool)
        .await?;

        Ok(FileStats {
            total: row.try_get::<i64, _>("total")?,
            total_bytes: row.try_get::<i64, _>("total_bytes")?,
            active: row.try_get::<i64, _>("active_count")?,
            archived: row.try_get::<i64, _>("archived_count")?,
            trashed: row.try_get::<i64, _>("trashed_count")?,
            deleted: row.try_get::<i64, _>("deleted_count")?,
        })
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct FileStats {
    pub total: i64,
    pub total_bytes: i64,
    pub active: i64,
    pub archived: i64,
    pub trashed: i64,
    pub deleted: i64,
}

use crate::models::file_record::{FileRecord, FileStatus};

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
