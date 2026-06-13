use sqlx::SqlitePool;

use crate::errors::AppResult;
use crate::models::lifecycle_event::{LifecycleEvent, LifecycleEventType};

#[derive(Clone)]
pub struct LifecycleRepository {
    pool: SqlitePool,
}

impl LifecycleRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn count(&self) -> AppResult<i64> {
        let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM lifecycle_events")
            .fetch_one(&self.pool)
            .await?;
        Ok(row.0)
    }

    pub async fn list_for_file(&self, file_id: &str) -> AppResult<Vec<LifecycleEvent>> {
        let rows: Vec<LifecycleEventRow> = sqlx::query_as(
            "SELECT * FROM lifecycle_events WHERE file_id = ? ORDER BY created_at ASC",
        )
        .bind(file_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(LifecycleEvent::from).collect())
    }

    pub async fn record(&self, event: &LifecycleEvent) -> AppResult<()> {
        sqlx::query(
            r#"
            INSERT INTO lifecycle_events
                (id, file_id, event_type, from_path, to_path, created_at, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&event.id)
        .bind(&event.file_id)
        .bind(event.event_type.as_str())
        .bind(&event.from_path)
        .bind(&event.to_path)
        .bind(event.created_at)
        .bind(&event.metadata_json)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

#[derive(sqlx::FromRow)]
struct LifecycleEventRow {
    id: String,
    file_id: String,
    event_type: String,
    from_path: Option<String>,
    to_path: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
    metadata_json: Option<String>,
}

impl From<LifecycleEventRow> for LifecycleEvent {
    fn from(row: LifecycleEventRow) -> Self {
        let event_type = LifecycleEventType::from_db(&row.event_type)
            .unwrap_or(LifecycleEventType::Discovered);
        Self {
            id: row.id,
            file_id: row.file_id,
            event_type,
            from_path: row.from_path,
            to_path: row.to_path,
            created_at: row.created_at,
            metadata_json: row.metadata_json,
        }
    }
}
