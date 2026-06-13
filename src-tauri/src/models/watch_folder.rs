use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WatchFrequency {
    Daily,
    Weekly,
    Monthly,
}

impl WatchFrequency {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Daily => "daily",
            Self::Weekly => "weekly",
            Self::Monthly => "monthly",
        }
    }

    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "daily" => Some(Self::Daily),
            "weekly" => Some(Self::Weekly),
            "monthly" => Some(Self::Monthly),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchFolder {
    pub id: String,
    pub path: String,
    pub label: String,
    pub enabled: bool,
    pub frequency: WatchFrequency,
    pub preferred_weekday: Option<i32>,
    pub preferred_hour: i32,
    pub preferred_minute: i32,
    pub last_scan_at: Option<chrono::DateTime<chrono::Utc>>,
    pub next_scan_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}
