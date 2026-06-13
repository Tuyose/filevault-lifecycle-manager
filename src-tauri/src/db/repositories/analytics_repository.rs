use chrono::{DateTime, Utc};
use sqlx::SqlitePool;

use crate::errors::AppResult;
use crate::models::analytics_snapshot::AnalyticsSnapshot;

#[derive(Clone)]
pub struct AnalyticsRepository {
    pool: SqlitePool,
}

impl AnalyticsRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn insert(&self, snapshot: &AnalyticsSnapshot) -> AppResult<()> {
        sqlx::query(
            r#"
            INSERT INTO analytics_snapshots
                (id, created_at, tracked_files, total_size_bytes,
                 duplicate_groups, duplicate_files, reclaimable_bytes, health_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&snapshot.id)
        .bind(snapshot.created_at)
        .bind(snapshot.tracked_files)
        .bind(snapshot.total_size_bytes)
        .bind(snapshot.duplicate_groups)
        .bind(snapshot.duplicate_files)
        .bind(snapshot.reclaimable_bytes)
        .bind(snapshot.health_score)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn latest(&self) -> AppResult<Option<AnalyticsSnapshot>> {
        let row: Option<SnapshotRow> = sqlx::query_as(
            "SELECT * FROM analytics_snapshots ORDER BY created_at DESC LIMIT 1",
        )
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(Into::into))
    }

    pub async fn recent(&self, limit: i64) -> AppResult<Vec<AnalyticsSnapshot>> {
        let rows: Vec<SnapshotRow> = sqlx::query_as(
            "SELECT * FROM analytics_snapshots ORDER BY created_at DESC LIMIT ?",
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    /// Remove snapshots older than the newest `keep` entries.
    pub async fn enforce_retention(&self, keep: i64) -> AppResult<i64> {
        let result = sqlx::query(
            r#"
            DELETE FROM analytics_snapshots
            WHERE id NOT IN (
                SELECT id FROM analytics_snapshots
                ORDER BY created_at DESC
                LIMIT ?
            )
            "#,
        )
        .bind(keep)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() as i64)
    }
}

#[derive(sqlx::FromRow)]
struct SnapshotRow {
    id: String,
    created_at: DateTime<Utc>,
    tracked_files: i64,
    total_size_bytes: i64,
    duplicate_groups: i64,
    duplicate_files: i64,
    reclaimable_bytes: i64,
    health_score: i64,
}

impl From<SnapshotRow> for AnalyticsSnapshot {
    fn from(r: SnapshotRow) -> Self {
        Self {
            id: r.id,
            created_at: r.created_at,
            tracked_files: r.tracked_files,
            total_size_bytes: r.total_size_bytes,
            duplicate_groups: r.duplicate_groups,
            duplicate_files: r.duplicate_files,
            reclaimable_bytes: r.reclaimable_bytes,
            health_score: r.health_score,
        }
    }
}
