use crate::services::retention_service;
use crate::AppState;

#[tauri::command]
pub async fn get_retention_settings(state: tauri::State<'_, AppState>) -> Result<retention_service::RetentionSettings, String> {
    let pool = state.database.pool().clone();
    retention_service::get_retention_settings(&pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_retention_settings(retention_days: u32, auto_purge_enabled: bool, state: tauri::State<'_, AppState>) -> Result<retention_service::RetentionSettings, String> {
    let pool = state.database.pool().clone();
    retention_service::update_retention_settings(&pool, retention_days, auto_purge_enabled).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_retention_summary(state: tauri::State<'_, AppState>) -> Result<retention_service::RetentionSummary, String> {
    let pool = state.database.pool().clone();
    retention_service::get_retention_summary(&pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_purge_candidates(state: tauri::State<'_, AppState>) -> Result<Vec<crate::models::file_record::FileRecord>, String> {
    let pool = state.database.pool().clone();
    retention_service::list_purge_candidates(&pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn purge_trashed_file(file_id: String, state: tauri::State<'_, AppState>) -> Result<retention_service::PurgeResult, String> {
    let pool = state.database.pool().clone();
    retention_service::purge_trashed_file(&pool, &file_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn purge_eligible_files(state: tauri::State<'_, AppState>) -> Result<retention_service::PurgeBatchResult, String> {
    let pool = state.database.pool().clone();
    retention_service::purge_eligible_files(&pool).await.map_err(|e| e.to_string())
}
