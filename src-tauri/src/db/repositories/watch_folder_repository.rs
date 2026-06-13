use chrono::{DateTime, Utc};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::errors::AppResult;
use crate::models::watch_folder::{WatchFolder, WatchFrequency};

#[derive(Clone)]
pub struct WatchFolderRepository {
    pool: SqlitePool,
}

impl WatchFolderRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn list(&self) -> AppResult<Vec<WatchFolder>> {
        let rows: Vec<WatchFolderRow> = sqlx::query_as(
            "SELECT * FROM watch_folders ORDER BY created_at DESC",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|r| r.into_domain()).collect())
    }

    pub async fn get(&self, id: &str) -> AppResult<Option<WatchFolder>> {
        let row: Option<WatchFolderRow> = sqlx::query_as(
            "SELECT * FROM watch_folders WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| r.into_domain()))
    }

    pub async fn add(&self, path: &str, label: &str, frequency: WatchFrequency,
                     preferred_weekday: Option<i32>, preferred_hour: i32,
                     preferred_minute: i32, next_scan_at: Option<DateTime<Utc>>) -> AppResult<WatchFolder> {
        let now = Utc::now();
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            r#"
            INSERT INTO watch_folders
                (id, path, label, enabled, frequency, preferred_weekday,
                 preferred_hour, preferred_minute, last_scan_at, next_scan_at,
                 created_at, updated_at)
            VALUES (?, ?, ?, 1, ?, ?, ?, ?, NULL, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(path)
        .bind(label)
        .bind(frequency.as_str())
        .bind(preferred_weekday)
        .bind(preferred_hour)
        .bind(preferred_minute)
        .bind(next_scan_at)
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await?;
        Ok(self.get(&id).await?.expect("just inserted"))
    }

    pub async fn update(&self, id: &str, label: &str, frequency: WatchFrequency,
                        preferred_weekday: Option<i32>, preferred_hour: i32,
                        preferred_minute: i32) -> AppResult<WatchFolder> {
        let now = Utc::now();
        sqlx::query(
            r#"
            UPDATE watch_folders
            SET label = ?, frequency = ?, preferred_weekday = ?,
                preferred_hour = ?, preferred_minute = ?, updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(label)
        .bind(frequency.as_str())
        .bind(preferred_weekday)
        .bind(preferred_hour)
        .bind(preferred_minute)
        .bind(now)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(self.get(id).await?.expect("exists after update"))
    }

    pub async fn delete(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM watch_folders WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn toggle(&self, id: &str, enabled: bool) -> AppResult<WatchFolder> {
        let now = Utc::now();
        sqlx::query("UPDATE watch_folders SET enabled = ?, updated_at = ? WHERE id = ?")
            .bind(enabled as i32)
            .bind(now)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(self.get(id).await?.expect("exists"))
    }

    pub async fn mark_scan_completed(&self, id: &str, next_scan_at: Option<DateTime<Utc>>) -> AppResult<()> {
        let now = Utc::now();
        sqlx::query(
            r#"
            UPDATE watch_folders
            SET last_scan_at = ?, next_scan_at = ?, updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(now)
        .bind(next_scan_at)
        .bind(now)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_due(&self, now: DateTime<Utc>) -> AppResult<Vec<WatchFolder>> {
        let rows: Vec<WatchFolderRow> = sqlx::query_as(
            r#"
            SELECT * FROM watch_folders
            WHERE enabled = 1
              AND next_scan_at IS NOT NULL
              AND next_scan_at <= ?
            ORDER BY next_scan_at ASC
            "#,
        )
        .bind(now)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|r| r.into_domain()).collect())
    }
}

#[derive(sqlx::FromRow)]
struct WatchFolderRow {
    id: String,
    path: String,
    label: String,
    enabled: i32,
    frequency: String,
    preferred_weekday: Option<i32>,
    preferred_hour: i32,
    preferred_minute: i32,
    last_scan_at: Option<DateTime<Utc>>,
    next_scan_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl WatchFolderRow {
    fn into_domain(self) -> WatchFolder {
        let frequency = WatchFrequency::from_db(&self.frequency).unwrap_or(WatchFrequency::Weekly);
        WatchFolder {
            id: self.id,
            path: self.path,
            label: self.label,
            enabled: self.enabled != 0,
            frequency,
            preferred_weekday: self.preferred_weekday,
            preferred_hour: self.preferred_hour,
            preferred_minute: self.preferred_minute,
            last_scan_at: self.last_scan_at,
            next_scan_at: self.next_scan_at,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}
