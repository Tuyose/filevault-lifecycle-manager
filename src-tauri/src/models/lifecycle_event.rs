use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LifecycleEventType {
    Discovered,
    Hashed,
    Archived,
    Restored,
    Trashed,
    Purged,
    Updated,
}

impl LifecycleEventType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Discovered => "discovered",
            Self::Hashed => "hashed",
            Self::Archived => "archived",
            Self::Restored => "restored",
            Self::Trashed => "trashed",
            Self::Purged => "purged",
            Self::Updated => "updated",
        }
    }

    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "discovered" => Some(Self::Discovered),
            "hashed" => Some(Self::Hashed),
            "archived" => Some(Self::Archived),
            "restored" => Some(Self::Restored),
            "trashed" => Some(Self::Trashed),
            "purged" => Some(Self::Purged),
            "updated" => Some(Self::Updated),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LifecycleEvent {
    pub id: String,
    pub file_id: String,
    pub event_type: LifecycleEventType,
    pub from_path: Option<String>,
    pub to_path: Option<String>,
    pub created_at: DateTime<Utc>,
    pub metadata_json: Option<String>,
}
