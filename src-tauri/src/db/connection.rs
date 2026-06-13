use std::path::{Path, PathBuf};
use std::sync::Arc;

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::SqlitePool;
use tokio::sync::Mutex;

use crate::errors::{AppError, AppResult};

/// Owns the SQLite connection pool. Cloning is cheap — the pool is
/// internally reference counted.
#[derive(Clone)]
pub struct Database {
    pool: SqlitePool,
    path: PathBuf,
    migrated: Arc<Mutex<bool>>,
}

impl Database {
    /// Open (and create if missing) the SQLite file at `path`.
    pub fn open(path: &Path) -> AppResult<Self> {
        let path = path.to_path_buf();
        let pool: SqlitePool = tauri::async_runtime::block_on(build_pool(path.clone()))?;

        Ok(Self {
            pool,
            path,
            migrated: Arc::new(Mutex::new(false)),
        })
    }

    /// Run embedded SQL migrations exactly once per process.
    pub fn run_migrations(&self) -> AppResult<()> {
        let pool = self.pool.clone();
        let migrated = self.migrated.clone();
        let outcome: Result<(), RunError> =
            tauri::async_runtime::block_on(run_migrations_async(pool, migrated))
                .map_err(|err| RunError::Runtime(err.to_string()));
        outcome.map_err(|err| err.into_app_error())
    }

    /// Cheap liveness probe used by the dashboard status card.
    pub fn ping(&self) -> AppResult<bool> {
        let pool = self.pool.clone();
        let outcome: Result<bool, RunError> =
            tauri::async_runtime::block_on(ping_async(pool))
                .map_err(|err| RunError::Runtime(err.to_string()));
        outcome.map_err(|err| err.into_app_error())
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

fn build_pool(path: PathBuf) -> impl std::future::Future<Output = AppResult<SqlitePool>> {
    let options = SqliteConnectOptions::new()
        .filename(&path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(std::time::Duration::from_secs(5));

    async move {
        SqlitePoolOptions::new()
            .max_connections(8)
            .connect_with(options)
            .await
            .map_err(AppError::from)
    }
}

async fn run_migrations_async(
    pool: SqlitePool,
    migrated: Arc<Mutex<bool>>,
) -> AppResult<()> {
    let mut guard = migrated.lock().await;
    if *guard {
        return Ok(());
    }

    sqlx::migrate!("./migrations").run(&pool).await?;
    *guard = true;
    Ok(())
}

async fn ping_async(pool: SqlitePool) -> AppResult<bool> {
    let row: (i64,) = sqlx::query_as("SELECT 1").fetch_one(&pool).await?;
    Ok(row.0 == 1)
}

/// Unifies the two error sources (inner future + runtime) into a single
/// `AppError` at the sync boundary.
#[allow(dead_code)]
enum RunError {
    Inner(AppError),
    Runtime(String),
}

impl RunError {
    fn into_app_error(self) -> AppError {
        match self {
            Self::Inner(err) => err,
            Self::Runtime(msg) => AppError::Internal(msg),
        }
    }
}
