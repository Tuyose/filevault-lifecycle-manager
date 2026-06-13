use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::db::repositories::analytics_repository::AnalyticsRepository;
use crate::db::repositories::file_repository::FileRepository;
use crate::errors::AppResult;
use crate::models::analytics_snapshot::AnalyticsSnapshot;

/// Creates analytics snapshots after each scan and provides trend data.
pub struct AnalyticsService {
    pool: SqlitePool,
    repo: AnalyticsRepository,
}

impl AnalyticsService {
    pub fn new(pool: SqlitePool) -> Self {
        Self {
            repo: AnalyticsRepository::new(pool.clone()),
            pool,
        }
    }

    /// Take a fresh snapshot of the current state and persist it.
    /// Also enforces retention (last 365 snapshots).
    pub async fn create_snapshot(&self) -> AppResult<AnalyticsSnapshot> {
        let files = FileRepository::new(self.pool.clone());
        let stats = files.aggregate_stats().await?;
        let groups = files.find_duplicate_groups().await?;

        let dup_groups = groups.len() as i64;
        let dup_files = groups.iter().map(|g| g.total_files as i64).sum::<i64>();
        let reclaimable = groups.iter().map(|g| g.total_wasted_bytes as i64).sum::<i64>();

        // Health score: simple formula
        let dup_penalty = if stats.active > 0 {
            ((dup_files as f64 / stats.active as f64) * 50.0) as i64
        } else {
            0
        };
        let reclaim_penalty = if reclaimable > 1_000_000_000 {
            20
        } else if reclaimable > 100_000_000 {
            10
        } else {
            5
        };
        let health = (100 - dup_penalty - reclaim_penalty).clamp(0, 100);

        let snapshot = AnalyticsSnapshot {
            id: Uuid::new_v4().to_string(),
            created_at: Utc::now(),
            tracked_files: stats.total,
            total_size_bytes: stats.total_bytes,
            duplicate_groups: dup_groups,
            duplicate_files: dup_files,
            reclaimable_bytes: reclaimable,
            health_score: health,
        };

        self.repo.insert(&snapshot).await?;
        self.repo.enforce_retention(365).await?;

        Ok(snapshot)
    }

    pub async fn latest_snapshot(&self) -> AppResult<Option<AnalyticsSnapshot>> {
        self.repo.latest().await
    }

    pub async fn recent_snapshots(&self, limit: i64) -> AppResult<Vec<AnalyticsSnapshot>> {
        let mut snapshots = self.repo.recent(limit).await?;
        snapshots.reverse(); // chronological order for charts
        Ok(snapshots)
    }
}
