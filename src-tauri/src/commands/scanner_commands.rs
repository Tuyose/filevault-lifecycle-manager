use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::core::scanner::{ProgressCallback, ScanProgress, ScanSummary};
use crate::db::repositories::file_repository::FileRepository;
use crate::db::repositories::file_repository::FileStats;
use crate::db::repositories::scan_run_repository::ScanRunRepository;
use crate::errors::AppError;
use crate::models::duplicate_group::DuplicateGroup;
use crate::models::scan_run::{ScanRun, ScanRunStatus};
use crate::AppState;
/// Placeholder — kept for backward compat. See `scan_folder`.
#[derive(Debug, Serialize)]
pub struct ScanPreview {
    pub requested_path: String,
    pub would_scan: bool,
}

#[tauri::command]
pub fn scan_folder_preview(path: String) -> ScanPreview {
    ScanPreview {
        requested_path: path,
        would_scan: true,
    }
}

/// Recursively scan `path` and persist metadata to the database.
/// Streams `scan:progress` events. Records a `scan_runs` row on
/// completion, cancellation, or error.
#[tauri::command]
pub async fn scan_folder(
    app: AppHandle,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<ScanSummary, String> {
    if path.trim().is_empty() {
        return Err(AppError::invalid("scan path is empty").to_string());
    }

    let root = PathBuf::from(&path);
    let controller = state.scan_controller.clone();
    controller.reset();

    let app_clone = app.clone();
    let on_progress: ProgressCallback = Box::new(move |progress: ScanProgress| {
        let _ = app_clone.emit("scan:progress", &progress);
    });

    let result = state
        .files
        .scan_with_progress(&root, on_progress, Some(controller))
        .await;

    // Determine status and persist a scan_run regardless of outcome.
    let (summary, status) = if let Ok(s) = &result {
        (s.clone(), ScanRunStatus::Completed)
    } else {
        let partial = ScanSummary {
            root: root.display().to_string(),
            ..Default::default()
        };
        (partial, ScanRunStatus::Error)
    };

    let pool = state.database.pool().clone();
    let repo = ScanRunRepository::new(pool.clone());
    let run = ScanRun {
        id: Uuid::new_v4().to_string(),
        root_path: summary.root.clone(),
        started_at: summary.started_at,
        finished_at: summary.finished_at,
        total_seen: summary.total_seen,
        inserted: summary.inserted,
        updated: summary.updated,
        errors: summary.errors,
        total_bytes: summary.total_bytes,
        status,
    };
    let _ = repo.insert(&run).await;

    // Create analytics snapshot after every scan
    if result.is_ok() {
        let analytics = crate::services::analytics_service::AnalyticsService::new(pool);
        if let Err(err) = analytics.create_snapshot().await {
            log::warn!("failed to create analytics snapshot: {err}");
        }
    }

    result.map_err(|err| err.to_string())
}

/// Aggregate stats for the dashboard / scan summary views.
#[tauri::command]
pub async fn get_scan_stats(
    state: tauri::State<'_, AppState>,
) -> Result<FileStats, String> {
    state
        .files
        .aggregate_stats()
        .await
        .map_err(|err| err.to_string())
}

/// Return the 20 most recent scan runs.
#[tauri::command]
pub async fn get_scan_history(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ScanRun>, String> {
    let pool = state.database.pool().clone();
    let repo = ScanRunRepository::new(pool);
    repo.list(20).await.map_err(|err| err.to_string())
}

/// Pause the running scan (if any).
#[tauri::command]
pub fn pause_scan(state: tauri::State<'_, AppState>) {
    state.scan_controller.pause();
    log::info!("scan paused by user");
}

/// Resume a paused scan.
#[tauri::command]
pub fn resume_scan(state: tauri::State<'_, AppState>) {
    state.scan_controller.resume();
    log::info!("scan resumed by user");
}

/// Cancel the running scan. The scanner will stop at the next file
/// boundary and return a partial summary.
#[tauri::command]
pub fn cancel_scan(state: tauri::State<'_, AppState>) {
    state.scan_controller.cancel();
    log::info!("scan cancelled by user");
}

/// Return all duplicate groups (files sharing the same BLAKE3 hash).
#[tauri::command]
pub async fn get_duplicate_groups(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DuplicateGroup>, String> {
    let pool = state.database.pool().clone();
    let repo = FileRepository::new(pool);
    repo.find_duplicate_groups().await.map_err(|err| err.to_string())
}
