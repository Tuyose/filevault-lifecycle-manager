use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct TrashAck {
    pub accepted: bool,
}

#[tauri::command]
pub fn trash_placeholder(file_id: String) -> TrashAck {
    log::info!("trash_placeholder requested for {file_id}");
    TrashAck { accepted: true }
}
