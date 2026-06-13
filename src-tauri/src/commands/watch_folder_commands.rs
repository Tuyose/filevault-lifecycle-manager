use chrono::Utc;

use crate::core::scheduler::calculate_next_scan;
use crate::db::repositories::watch_folder_repository::WatchFolderRepository;
use crate::models::watch_folder::{WatchFolder, WatchFrequency};
use crate::services::scheduler_service::SchedulerStatus;
use crate::AppState;

// ── List ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_watch_folders(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<WatchFolder>, String> {
    let pool = state.database.pool().clone();
    let repo = WatchFolderRepository::new(pool);
    repo.list().await.map_err(|e| e.to_string())
}

// ── Add ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn add_watch_folder(
    path: String,
    label: String,
    frequency: String,
    preferred_weekday: Option<i32>,
    preferred_hour: i32,
    preferred_minute: i32,
    state: tauri::State<'_, AppState>,
) -> Result<WatchFolder, String> {
    let freq = WatchFrequency::from_db(&frequency).ok_or_else(|| format!("invalid frequency: {frequency}"))?;
    let pool = state.database.pool().clone();
    let repo = WatchFolderRepository::new(pool);

    let next = calculate_next_scan(freq, preferred_weekday, preferred_hour, preferred_minute, Utc::now());

    repo.add(&path, &label, freq, preferred_weekday, preferred_hour, preferred_minute, Some(next))
        .await
        .map_err(|e| e.to_string())
}

// ── Update ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn update_watch_folder(
    id: String,
    label: String,
    frequency: String,
    preferred_weekday: Option<i32>,
    preferred_hour: i32,
    preferred_minute: i32,
    state: tauri::State<'_, AppState>,
) -> Result<WatchFolder, String> {
    let freq = WatchFrequency::from_db(&frequency).ok_or_else(|| format!("invalid frequency: {frequency}"))?;
    let pool = state.database.pool().clone();
    let repo = WatchFolderRepository::new(pool);
    repo.update(&id, &label, freq, preferred_weekday, preferred_hour, preferred_minute)
        .await
        .map_err(|e| e.to_string())
}

// ── Delete ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn delete_watch_folder(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pool = state.database.pool().clone();
    let repo = WatchFolderRepository::new(pool);
    repo.delete(&id).await.map_err(|e| e.to_string())
}

// ── Toggle ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn toggle_watch_folder(
    id: String,
    enabled: bool,
    state: tauri::State<'_, AppState>,
) -> Result<WatchFolder, String> {
    let pool = state.database.pool().clone();
    let repo = WatchFolderRepository::new(pool);
    repo.toggle(&id, enabled).await.map_err(|e| e.to_string())
}

// ── Run now ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn run_watch_folder_scan(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pool = state.database.pool().clone();
    let repo = WatchFolderRepository::new(pool);

    let wf = repo.get(&id).await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "watch folder not found".to_string())?;

    let path = std::path::PathBuf::from(&wf.path);
    let noop: crate::core::scanner::ProgressCallback = Box::new(|_| {});
    state.files.scan_with_progress(&path, noop, None).await
        .map_err(|e| e.to_string())?;

    let next = calculate_next_scan(
        wf.frequency, wf.preferred_weekday,
        wf.preferred_hour, wf.preferred_minute, Utc::now(),
    );
    repo.mark_scan_completed(&wf.id, Some(next)).await
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ── Scheduler status ─────────────────────────────────────────────

#[tauri::command]
pub async fn get_scheduler_status(
    state: tauri::State<'_, AppState>,
) -> Result<SchedulerStatus, String> {
    state.scheduler_status().await.map_err(|e| e.to_string())
}
