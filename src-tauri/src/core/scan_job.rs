use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

/// What kicked off the scan — used for routing post-scan updates.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ScanSource {
    Manual,
    WatchFolder,
    Scheduled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScanJobStatus {
    Idle,
    Counting,
    Scanning,
    Paused,
    Cancelled,
    Completed,
    Error,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanJob {
    pub id: String,
    pub path: String,
    pub source: ScanSource,
    pub watch_folder_id: Option<String>,
    pub status: ScanJobStatus,
    pub started_at: Option<DateTime<Utc>>,
    pub finished_at: Option<DateTime<Utc>>,
    pub processed: i64,
    pub total_files: i64,
    pub current_path: Option<String>,
    pub current_dir: Option<String>,
    pub error_message: Option<String>,
}

/// Simple singleton-like holder for the one active scan job (MVP).
#[derive(Clone)]
pub struct ScanJobManager {
    inner: Arc<RwLock<Option<ScanJob>>>,
}

impl ScanJobManager {
    pub fn new() -> Self {
        Self { inner: Arc::new(RwLock::new(None)) }
    }

    pub async fn get(&self) -> Option<ScanJob> {
        self.inner.read().await.clone()
    }

    pub async fn set(&self, job: ScanJob) {
        *self.inner.write().await = Some(job);
    }

    pub async fn update_status(&self, status: ScanJobStatus) {
        let mut guard = self.inner.write().await;
        if let Some(ref mut job) = *guard {
            job.status = status;
            if matches!(status, ScanJobStatus::Completed | ScanJobStatus::Cancelled | ScanJobStatus::Error) {
                job.finished_at = Some(Utc::now());
            }
        }
    }

    pub async fn update_progress(&self, processed: i64, total: i64, current_path: Option<String>, current_dir: Option<String>) {
        let mut guard = self.inner.write().await;
        if let Some(ref mut job) = *guard {
            job.processed = processed;
            job.total_files = total;
            job.current_path = current_path;
            job.current_dir = current_dir;
        }
    }

    pub async fn update_error(&self, msg: Option<String>) {
        let mut guard = self.inner.write().await;
        if let Some(ref mut job) = *guard {
            job.error_message = msg;
        }
    }

    pub async fn is_active(&self) -> bool {
        self.inner.read().await.as_ref().map(|j| {
            matches!(j.status, ScanJobStatus::Counting | ScanJobStatus::Scanning | ScanJobStatus::Paused)
        }).unwrap_or(false)
    }
}
