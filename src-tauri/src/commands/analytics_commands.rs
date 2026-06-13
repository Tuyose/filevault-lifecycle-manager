use crate::models::analytics_snapshot::AnalyticsSnapshot;
use crate::services::analytics_service::AnalyticsService;
use crate::AppState;

#[tauri::command]
pub async fn get_dashboard_analytics(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<AnalyticsSnapshot>, String> {
    let pool = state.database.pool().clone();
    let svc = AnalyticsService::new(pool);
    svc.recent_snapshots(30).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_health_breakdown(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let pool = state.database.pool().clone();
    let svc = AnalyticsService::new(pool);

    let latest = svc.latest_snapshot().await.map_err(|e| e.to_string())?;
    let snapshot = latest.ok_or_else(|| "No analytics data yet".to_string())?;

    // Build breakdown from snapshot values
    let dup_density = (100i64.saturating_sub(
        if snapshot.duplicate_files > 0 { (snapshot.duplicate_files * 100 / snapshot.tracked_files.max(1)) } else { 0 }
    )).clamp(0, 100);

    let reclaimable_risk = if snapshot.reclaimable_bytes > 1_000_000_000 {
        40
    } else if snapshot.reclaimable_bytes > 100_000_000 {
        60
    } else {
        90
    };

    let mut tips: Vec<String> = Vec::new();
    if dup_density < 70 {
        tips.push("Reduce duplicate files to improve health".to_string());
    }
    if snapshot.reclaimable_bytes > 500_000_000 {
        tips.push("Clean up duplicates to reclaim space".to_string());
    }

    let breakdown = serde_json::json!({
        "overall": snapshot.health_score,
        "duplicateDensity": dup_density,
        "storageEfficiency": (100i64.saturating_sub(
            if snapshot.total_size_bytes > 0 { (snapshot.reclaimable_bytes * 100 / snapshot.total_size_bytes.max(1)) } else { 0 }
        )).clamp(0, 100),
        "reclaimableRisk": reclaimable_risk,
        "tips": tips,
    });

    Ok(breakdown)
}

#[tauri::command]
pub async fn get_scan_trends(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<AnalyticsSnapshot>, String> {
    let pool = state.database.pool().clone();
    let svc = AnalyticsService::new(pool);
    svc.recent_snapshots(30).await.map_err(|e| e.to_string())
}
