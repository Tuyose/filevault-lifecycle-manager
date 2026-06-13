use serde::{Deserialize, Serialize};

/// Key/value store backing `app_settings`. Values are stored as
/// serialised JSON so the same row can host strings, numbers, structs
/// or arrays without schema changes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSetting {
    pub key: String,
    pub value: serde_json::Value,
}
