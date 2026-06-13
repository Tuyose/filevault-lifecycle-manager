use std::sync::Arc;

use chrono::Utc;
use tokio::sync::Mutex;
use tokio::time::{interval, Duration};

use crate::core::scheduler::calculate_next_scan;
use crate::db::repositories::watch_folder_repository::WatchFolderRepository;
use crate::services::file_service::FileService;

#[derive(Debug, Clone, serde::Serialize)]
pub struct SchedulerStatus {
    pub idle: bool,
    pub scanning: bool,
    pub next_scan_label: String,
}

pub struct SchedulerService {
    repo: WatchFolderRepository,
    files: Arc<FileService>,
    scanning: Arc<Mutex<bool>>,
}

impl SchedulerService {
    pub fn new(repo: WatchFolderRepository, files: Arc<FileService>) -> Self {
        Self {
            repo,
            files,
            scanning: Arc::new(Mutex::new(false)),
        }
    }

    pub fn start(&self) {
        let repo = self.repo.clone();
        let files = self.files.clone();
        let scanning = self.scanning.clone();

        tauri::async_runtime::spawn(async move {
            let mut tick = interval(Duration::from_secs(60));
            loop {
                tick.tick().await;

                let mut guard = scanning.lock().await;
                if *guard {
                    continue;
                }

                let due = match repo.list_due(Utc::now()).await {
                    Ok(list) => list,
                    Err(err) => {
                        log::warn!("scheduler: list_due failed: {err}");
                        continue;
                    }
                };

                if due.is_empty() {
                    continue;
                }

                *guard = true;
                drop(guard);

                for wf in &due {
                    log::info!("scheduler: scanning watch folder '{}' ({})", wf.label, wf.path);
                    let path = std::path::PathBuf::from(&wf.path);
                    let noop: crate::core::scanner::ProgressCallback = Box::new(|_| {});
                    let result = files.scan_with_progress(&path, noop, None).await;

                    match result {
                        Ok(_) => log::info!("scheduler: scan of '{}' completed", wf.label),
                        Err(err) => log::warn!("scheduler: scan of '{}' failed: {err}", wf.label),
                    }

                    let next = calculate_next_scan(
                        wf.frequency,
                        wf.preferred_weekday,
                        wf.preferred_hour,
                        wf.preferred_minute,
                        Utc::now(),
                    );

                    if let Err(err) = repo.mark_scan_completed(&wf.id, Some(next)).await {
                        log::warn!("scheduler: mark_scan_completed failed: {err}");
                    }
                }

                // Clear scanning flag
                let mut guard = scanning.lock().await;
                *guard = false;
                drop(guard);
            }
        });
    }

    pub async fn status(&self) -> SchedulerStatus {
        let is_scanning = *self.scanning.lock().await;

        let due = self.repo.list().await.ok().unwrap_or_default();
        let next = due
            .iter()
            .filter(|w| w.enabled && w.next_scan_at.is_some())
            .min_by_key(|w| w.next_scan_at);

        let label = match next {
            Some(w) => {
                let secs = (w.next_scan_at.unwrap() - Utc::now()).num_seconds().max(0);
                if secs < 3600 {
                    format!("Next scan in {}m", secs / 60)
                } else {
                    format!("Next scan in {}h", secs / 3600)
                }
            }
            None => "No upcoming scans".to_string(),
        };

        SchedulerStatus {
            idle: !is_scanning,
            scanning: is_scanning,
            next_scan_label: label,
        }
    }
}
