use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Lifecycle status of a tracked file. Stored as a string in SQLite;
/// `as_str` / `from_db` are the only places that know the on-disk
/// representation, so we can change it without touching the rest of the
/// app.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileStatus {
    Active,
    Archived,
    Trashed,
    Deleted,
}

impl FileStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            FileStatus::Active => "active",
            FileStatus::Archived => "archived",
            FileStatus::Trashed => "trashed",
            FileStatus::Deleted => "deleted",
        }
    }

    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "active" => Some(Self::Active),
            "archived" => Some(Self::Archived),
            "trashed" => Some(Self::Trashed),
            "deleted" => Some(Self::Deleted),
            _ => None,
        }
    }
}

/// A row from the `files` table. Hash, status timestamps, and extension
/// are optional so partially ingested rows remain valid while scanning.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileRecord {
    pub id: String,
    pub original_path: String,
    pub current_path: String,
    pub file_name: String,
    pub extension: Option<String>,
    pub size_bytes: i64,
    pub hash: Option<String>,
    pub status: FileStatus,
    pub created_at: DateTime<Utc>,
    pub modified_at: Option<DateTime<Utc>>,
    pub last_seen_at: DateTime<Utc>,
    pub archived_at: Option<DateTime<Utc>>,
    pub trashed_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>,
}
