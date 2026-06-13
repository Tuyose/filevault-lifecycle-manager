use serde::{Deserialize, Serialize};

/// One file inside a duplicate group.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateFile {
    pub id: String,
    pub path: String,
    pub size_bytes: i64,
    pub modified_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// A group of files sharing the same BLAKE3 hash.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateGroup {
    pub hash: String,
    pub total_files: u32,
    pub total_wasted_bytes: u64,
    pub files: Vec<DuplicateFile>,
}
