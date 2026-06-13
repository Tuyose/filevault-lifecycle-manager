use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ArchiveAck {
    pub accepted: bool,
}

#[tauri::command]
pub fn archive_placeholder(file_id: String) -> ArchiveAck {
    log::info!("archive_placeholder requested for {file_id}");
    ArchiveAck { accepted: true }
}
