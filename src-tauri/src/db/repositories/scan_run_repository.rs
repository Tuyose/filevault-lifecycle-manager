use sqlx::SqlitePool;

use crate::errors::AppResult;
use crate::models::scan_run::{ScanRun, ScanRunStatus};

#[derive(Clone)]
pub struct ScanRunRepository {
    pool: SqlitePool,
}

impl ScanRunRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn insert(&self, run: &ScanRun) -> AppResult<()> {
        sqlx::query(
            r#"
            INSERT INTO scan_runs
                (id, root_path, started_at, finished_at,
                 total_seen, inserted, updated, errors, total_bytes, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&run.id)
        .bind(&run.root_path)
        .bind(run.started_at)
        .bind(run.finished_at)
        .bind(run.total_seen)
        .bind(run.inserted)
        .bind(run.updated)
        .bind(run.errors)
        .bind(run.total_bytes)
        .bind(run.status.as_str())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn list(&self, limit: i64) -> AppResult<Vec<ScanRun>> {
        let rows: Vec<ScanRunRow> = sqlx::query_as(
            "SELECT * FROM scan_runs ORDER BY finished_at DESC LIMIT ?",
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(ScanRun::from).collect())
    }
}

#[derive(sqlx::FromRow)]
struct ScanRunRow {
    id: String,
    root_path: String,
    started_at: chrono::DateTime<chrono::Utc>,
    finished_at: chrono::DateTime<chrono::Utc>,
    total_seen: i64,
    inserted: i64,
    updated: i64,
    errors: i64,
    total_bytes: i64,
    status: String,
}

impl From<ScanRunRow> for ScanRun {
    fn from(row: ScanRunRow) -> Self {
        let status = ScanRunStatus::from_db(&row.status).unwrap_or(ScanRunStatus::Error);
        Self {
            id: row.id,
            root_path: row.root_path,
            started_at: row.started_at,
            finished_at: row.finished_at,
            total_seen: row.total_seen,
            inserted: row.inserted,
            updated: row.updated,
            errors: row.errors,
            total_bytes: row.total_bytes,
            status,
        }
    }
}
