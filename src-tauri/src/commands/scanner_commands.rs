use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::core::scan_job::{ScanJob, ScanJobStatus, ScanSource};
use crate::core::scanner::{ProgressCallback, ScanProgress, ScanSummary};
use crate::db::repositories::file_repository::FileRepository;
use crate::db::repositories::file_repository::FileStats;
use crate::db::repositories::scan_run_repository::ScanRunRepository;
use crate::models::duplicate_group::DuplicateGroup;
use crate::models::scan_run::{ScanRun, ScanRunStatus};
use crate::services::analytics_service::AnalyticsService;
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct ScanPreview {
    pub requested_path: String,
    pub would_scan: bool,
}

#[tauri::command]
pub fn scan_folder_preview(path: String) -> ScanPreview {
    ScanPreview { requested_path: path, would_scan: true }
}

// ── start_scan_job: spawns background task, returns immediately ──

#[derive(Debug, Deserialize)]
pub struct StartScanJobArgs {
    pub path: String,
    pub source: String,
    pub watch_folder_id: Option<String>,
}

#[tauri::command]
pub async fn start_scan_job(
    app: AppHandle,
    args: StartScanJobArgs,
    state: tauri::State<'_, AppState>,
) -> Result<ScanJob, String> {
    if state.scan_job_manager.is_active().await {
        if let Some(existing) = state.scan_job_manager.get().await {
            return Ok(existing);
        }
    }

    let job_id = Uuid::new_v4().to_string();
    let source = match args.source.as_str() {
        "watch-folder" => ScanSource::WatchFolder,
        "scheduled" => ScanSource::Scheduled,
        _ => ScanSource::Manual,
    };

    let job = ScanJob {
        id: job_id.clone(),
        path: args.path.clone(),
        source,
        watch_folder_id: args.watch_folder_id.clone(),
        status: ScanJobStatus::Counting,
        started_at: Some(chrono::Utc::now()),
        finished_at: None,
        processed: 0,
        total_files: 0,
        current_path: None,
        current_dir: None,
        error_message: None,
    };
    state.scan_job_manager.set(job.clone()).await;

    let root = PathBuf::from(&args.path);
    let files = state.files.clone();
    let controller = state.scan_controller.clone();
    let job_mgr = state.scan_job_manager.clone();
    let pool = state.database.pool().clone();
    let app_clone = app.clone();
    let jid = job_id.clone();

    tauri::async_runtime::spawn(async move {
        controller.reset();
        let on_progress: ProgressCallback = Box::new({
            let app = app_clone.clone();
            let mgr = job_mgr.clone();
            move |progress: ScanProgress| {
                let _ = app.emit("scan:progress", &progress);
                let mgr2 = mgr.clone();
                let p = progress.clone();
                tokio::task::spawn(async move {
                    mgr2.update_progress(p.processed, p.total_files, Some(p.current_path.clone()), Some(p.current_dir.clone())).await;
                    let status = match p.phase.as_str() {
                        "Counting" => ScanJobStatus::Counting,
                        "Scanning" => ScanJobStatus::Scanning,
                        "Done" => ScanJobStatus::Completed,
                        _ => ScanJobStatus::Scanning,
                    };
                    mgr2.update_status(status).await;
                });
            }
        });

        let result = files.scan_with_progress(&root, on_progress, Some(controller.clone())).await;

        let (summary, run_status) = if let Ok(ref s) = result { (s.clone(), ScanRunStatus::Completed) }
            else { (ScanSummary { root: root.display().to_string(), ..Default::default() }, ScanRunStatus::Error) };

        let repo = ScanRunRepository::new(pool.clone());
        let run = ScanRun {
            id: Uuid::new_v4().to_string(), root_path: summary.root.clone(),
            started_at: summary.started_at, finished_at: summary.finished_at,
            total_seen: summary.total_seen, inserted: summary.inserted,
            updated: summary.updated, errors: summary.errors,
            total_bytes: summary.total_bytes, status: run_status,
        };
        let _ = repo.insert(&run).await;

        if result.is_ok() {
            let _ = AnalyticsService::new(pool).create_snapshot().await;
        }

        job_mgr.update_status(if result.is_ok() { ScanJobStatus::Completed } else { ScanJobStatus::Error }).await;
        job_mgr.update_error(result.as_ref().err().map(|e| e.to_string())).await;
    });

    Ok(job)
}

// ── scan_folder: blocking (for tests & backward compat) ──────────

#[tauri::command]
pub async fn scan_folder(
    app: AppHandle,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<ScanSummary, String> {
    let root = PathBuf::from(&path);
    let controller = state.scan_controller.clone();
    controller.reset();

    // Populate ScanJobManager so GlobalActivityBar and polls can see this scan
    let job_id = Uuid::new_v4().to_string();
    state.scan_job_manager.set(ScanJob {
        id: job_id,
        path: path.clone(),
        source: ScanSource::Manual,
        watch_folder_id: None,
        status: ScanJobStatus::Counting,
        started_at: Some(chrono::Utc::now()),
        finished_at: None,
        processed: 0,
        total_files: 0,
        current_path: None,
        current_dir: None,
        error_message: None,
    }).await;

    let result = state.files
        .scan_with_progress(&root, Box::new({
            let a = app.clone();
            let mgr = state.scan_job_manager.clone();
            move |p: ScanProgress| {
                let _ = a.emit("scan:progress", &p);
                // Fire-and-forget update — don't block the scan loop
                let mgr2 = mgr.clone();
                let p2 = p.clone();
                tokio::task::spawn(async move {
                    mgr2.update_progress(p2.processed, p2.total_files, Some(p2.current_path), Some(p2.current_dir)).await;
                });
            }
        }), Some(controller.clone()))
        .await;

    // Update final status
    state.scan_job_manager.update_status(if result.is_ok() { ScanJobStatus::Completed } else { ScanJobStatus::Error }).await;

    if let Ok(ref summary) = result {
        let pool = state.database.pool().clone();
        let repo = ScanRunRepository::new(pool.clone());
        let run = ScanRun {
            id: Uuid::new_v4().to_string(), root_path: summary.root.clone(),
            started_at: summary.started_at, finished_at: summary.finished_at,
            total_seen: summary.total_seen, inserted: summary.inserted,
            updated: summary.updated, errors: summary.errors,
            total_bytes: summary.total_bytes, status: ScanRunStatus::Completed,
        };
        let _ = repo.insert(&run).await;
        let _ = AnalyticsService::new(pool).create_snapshot().await;
    }

    result.map_err(|e| e.to_string())
}

// ── Query commands ───────────────────────────────────────────────

#[tauri::command]
pub async fn get_scan_stats(state: tauri::State<'_, AppState>) -> Result<FileStats, String> {
    FileRepository::new(state.database.pool().clone()).aggregate_stats().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_scan_history(state: tauri::State<'_, AppState>) -> Result<Vec<ScanRun>, String> {
    ScanRunRepository::new(state.database.pool().clone()).list(50).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_duplicate_groups(state: tauri::State<'_, AppState>) -> Result<Vec<DuplicateGroup>, String> {
    FileRepository::new(state.database.pool().clone()).find_duplicate_groups().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_active_scan_job(state: tauri::State<'_, AppState>) -> Result<Option<ScanJob>, String> {
    Ok(state.scan_job_manager.get().await)
}

#[tauri::command] pub fn pause_scan(state: tauri::State<'_, AppState>) { state.scan_controller.pause(); }
#[tauri::command] pub fn resume_scan(state: tauri::State<'_, AppState>) { state.scan_controller.resume(); }
#[tauri::command] pub fn cancel_scan(state: tauri::State<'_, AppState>) { state.scan_controller.cancel(); }
