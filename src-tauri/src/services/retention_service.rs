use chrono::{DateTime, Duration, Utc};
use serde::Serialize;
use sqlx::Row;
use tokio::fs;

use crate::db::repositories::file_repository::FileRepository;
use crate::errors::{AppError, AppResult};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetentionSettings {
    pub retention_days: u32,
    pub auto_purge_enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetentionSummary {
    pub retention_days: u32,
    pub auto_purge_enabled: bool,
    pub trashed_files: i64,
    pub purge_eligible_files: i64,
    pub purge_eligible_bytes: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurgeResult {
    pub file_id: String,
    pub deleted_path: String,
    pub status: String,
    pub purged_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurgeBatchResult {
    pub purged_files: u64,
    pub purged_bytes: u64,
    pub errors: u64,
    pub error_samples: Vec<String>,
}

// ── Settings ─────────────────────────────────────────────────

async fn get_setting(pool: &sqlx::SqlitePool, key: &str) -> AppResult<Option<String>> {
    let row = sqlx::query("SELECT value FROM app_settings WHERE key = ?")
        .bind(key).fetch_optional(pool).await?;
    Ok(row.map(|r| r.get::<String, _>(0)))
}

async fn set_setting(pool: &sqlx::SqlitePool, key: &str, value: &str) -> AppResult<()> {
    sqlx::query("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)")
        .bind(key).bind(value).execute(pool).await?;
    Ok(())
}

pub async fn get_retention_settings(pool: &sqlx::SqlitePool) -> AppResult<RetentionSettings> {
    let days: u32 = get_setting(pool, "trash.retention_days").await?
        .and_then(|v| v.parse().ok()).unwrap_or(30);
    let auto: bool = get_setting(pool, "trash.auto_purge_enabled").await?
        .and_then(|v| v.parse().ok()).unwrap_or(false);
    Ok(RetentionSettings { retention_days: days, auto_purge_enabled: auto })
}

pub async fn update_retention_settings(pool: &sqlx::SqlitePool, retention_days: u32, auto_purge_enabled: bool) -> AppResult<RetentionSettings> {
    set_setting(pool, "trash.retention_days", &retention_days.to_string()).await?;
    set_setting(pool, "trash.auto_purge_enabled", &auto_purge_enabled.to_string()).await?;
    Ok(RetentionSettings { retention_days, auto_purge_enabled })
}

// ── Candidates ──────────────────────────────────────────────

fn cutoff(settings: &RetentionSettings) -> DateTime<Utc> {
    Utc::now() - Duration::days(settings.retention_days as i64)
}

pub async fn get_retention_summary(pool: &sqlx::SqlitePool) -> AppResult<RetentionSummary> {
    let settings = get_retention_settings(pool).await?;
    let cut = cutoff(&settings);
    let repo = FileRepository::new(pool.clone());
    let trashed = repo.count_by_status("trashed").await.unwrap_or(0);
    let eligible = repo.count_purge_candidates(cut).await.unwrap_or(0);
    let eligible_bytes = repo.sum_purge_candidate_bytes(cut).await.unwrap_or(0);
    Ok(RetentionSummary {
        retention_days: settings.retention_days,
        auto_purge_enabled: settings.auto_purge_enabled,
        trashed_files: trashed,
        purge_eligible_files: eligible,
        purge_eligible_bytes: eligible_bytes,
    })
}

pub async fn list_purge_candidates(pool: &sqlx::SqlitePool) -> AppResult<Vec<crate::models::file_record::FileRecord>> {
    let settings = get_retention_settings(pool).await?;
    let cut = cutoff(&settings);
    let repo = FileRepository::new(pool.clone());
    repo.list_purge_candidates(cut).await
}

// ── Purge ───────────────────────────────────────────────────

pub async fn purge_trashed_file(pool: &sqlx::SqlitePool, file_id: &str) -> AppResult<PurgeResult> {
    let repo = FileRepository::new(pool.clone());
    let record = repo.find_by_id(file_id).await?
        .ok_or_else(|| AppError::not_found("File not found."))?;

    if record.status != crate::models::file_record::FileStatus::Trashed {
        return Err(AppError::invalid("Only trashed files can be permanently deleted."));
    }

    let path = std::path::PathBuf::from(&record.current_path);
    let file_missing = !path.exists();
    if !file_missing {
        if path.is_file() {
            fs::remove_file(&path).await.map_err(AppError::Io)?;
        }
    }

    let now = Utc::now();
    repo.mark_deleted(file_id, now).await?;

    let metadata = if file_missing {
        r#"{"source":"manual","file_missing":true}"#
    } else {
        r#"{"source":"manual","retention_days":30}"#
    };

    let _ = sqlx::query(
        "INSERT INTO lifecycle_events (id, file_id, event_type, from_path, to_path, created_at, metadata_json) VALUES (?,?,?,?,?,?,?)"
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(file_id)
    .bind("purge")
    .bind(&record.current_path)
    .bind("")
    .bind(now)
    .bind(metadata)
    .execute(pool).await;

    Ok(PurgeResult {
        file_id: file_id.to_string(),
        deleted_path: record.current_path,
        status: "deleted".to_string(),
        purged_at: now.to_rfc3339(),
    })
}

pub async fn purge_eligible_files(pool: &sqlx::SqlitePool) -> AppResult<PurgeBatchResult> {
    let settings = get_retention_settings(pool).await?;
    let cut = cutoff(&settings);
    let repo = FileRepository::new(pool.clone());
    let candidates = repo.list_purge_candidates(cut).await?;

    let mut purged = 0u64;
    let mut purged_bytes = 0u64;
    let mut errors = 0u64;
    let mut error_samples: Vec<String> = Vec::new();

    for f in &candidates {
        match purge_trashed_file(pool, &f.id).await {
            Ok(r) => {
                purged += 1;
                if let Ok(m) = tokio::fs::metadata(&r.deleted_path).await { purged_bytes += m.len(); }
            }
            Err(e) => {
                errors += 1;
                if error_samples.len() < 10 {
                    error_samples.push(format!("{}: {}", f.file_name, e));
                }
            }
        }
    }

    Ok(PurgeBatchResult { purged_files: purged, purged_bytes, errors, error_samples })
}
