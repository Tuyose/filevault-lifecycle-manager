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
    pub hash: Option<String>,
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
                    file.hash.as_deref(),
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
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, NULL, NULL, NULL)
            "#,
        )
        .bind(&file.id)
        .bind(&file.original_path)
        .bind(&file.current_path)
        .bind(&file.file_name)
        .bind(&file.extension)
        .bind(file.size_bytes)
        .bind(&file.hash)
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
                        file.hash.as_deref(),
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
        hash: Option<&str>,
    ) -> AppResult<()> {
        if let Some(h) = hash {
            sqlx::query(
                r#"
                UPDATE files
                SET current_path = ?,
                    size_bytes   = ?,
                    modified_at  = ?,
                    last_seen_at = ?,
                    hash         = ?
                WHERE id = ?
                "#,
            )
            .bind(current_path)
            .bind(size_bytes)
            .bind(modified_at)
            .bind(last_seen_at)
            .bind(h)
            .bind(id)
            .execute(&self.pool)
            .await?;
        } else {
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
        }
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

    /// Find all groups of files that share the same BLAKE3 hash.
    /// Only active files with a non-null hash are considered.
    /// Returns groups ordered by wasted space descending.
    pub async fn find_duplicate_groups(&self) -> AppResult<Vec<DuplicateGroup>> {
        // Step 1: find hashes with more than one file
        let groups: Vec<HashGroupRow> = sqlx::query_as(
            r#"
            SELECT hash, COUNT(*) AS total, SUM(size_bytes) AS total_bytes
            FROM files
            WHERE hash IS NOT NULL AND status = 'active'
            GROUP BY hash
            HAVING COUNT(*) > 1
            ORDER BY SUM(size_bytes) DESC
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        let mut result = Vec::with_capacity(groups.len());

        for g in groups {
            let rows: Vec<DuplicateFileRow> = sqlx::query_as(
                r#"
                SELECT id, current_path, size_bytes, modified_at
                FROM files
                WHERE hash = ? AND status = 'active'
                ORDER BY current_path
                "#,
            )
            .bind(&g.hash)
            .fetch_all(&self.pool)
            .await?;

            result.push(DuplicateGroup {
                hash: g.hash,
                total_files: g.total as u32,
                total_wasted_bytes: g.total_bytes as u64,
                files: rows.into_iter().map(DuplicateFile::from).collect(),
            });
        }

        Ok(result)
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

use crate::models::duplicate_group::{DuplicateFile, DuplicateGroup};
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

#[derive(sqlx::FromRow)]
struct HashGroupRow {
    hash: String,
    total: i64,
    total_bytes: i64,
}

#[derive(sqlx::FromRow)]
struct DuplicateFileRow {
    id: String,
    current_path: String,
    size_bytes: i64,
    modified_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl From<DuplicateFileRow> for DuplicateFile {
    fn from(row: DuplicateFileRow) -> Self {
        Self {
            id: row.id,
            path: row.current_path,
            size_bytes: row.size_bytes,
            modified_at: row.modified_at,
        }
    }
}
