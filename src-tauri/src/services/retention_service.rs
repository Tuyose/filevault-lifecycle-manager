use std::time::Duration;

use chrono::Utc;

/// Applies retention policies to files in the trash and the archive.
/// Intentionally lightweight in the skeleton — the real implementation
/// will be driven by user-configurable rules stored in `app_settings`.
pub struct RetentionService;

impl RetentionService {
    pub fn new() -> Self {
        Self
    }

    /// Default grace period before trashed files are eligible for
    /// permanent deletion. Returned for inspection in the UI.
    pub fn default_trash_grace_period(&self) -> Duration {
        Duration::from_secs(60 * 60 * 24 * 30) // 30 days
    }

    /// Placeholder that "runs" retention; the real implementation will
    /// iterate over trashed files older than the grace period and
    /// schedule them for purge.
    pub async fn run(&self) -> crate::errors::AppResult<RetentionReport> {
        Ok(RetentionReport {
            scanned_at: Utc::now(),
            trashed: 0,
            purged: 0,
        })
    }
}

impl Default for RetentionService {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, serde::Serialize)]
pub struct RetentionReport {
    pub scanned_at: chrono::DateTime<chrono::Utc>,
    pub trashed: usize,
    pub purged: usize,
}
