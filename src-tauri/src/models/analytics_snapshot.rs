use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticsSnapshot {
    pub id: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub tracked_files: i64,
    pub total_size_bytes: i64,
    pub duplicate_groups: i64,
    pub duplicate_files: i64,
    pub reclaimable_bytes: i64,
    pub health_score: i64,
}
