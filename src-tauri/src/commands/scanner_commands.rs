use serde::Serialize;

/// Placeholder for the real scanner command. Real implementation will
/// stream metadata + hashes back as the scan progresses. This stub
/// exists so the React scanner page can validate its IPC wiring.
#[derive(Debug, Serialize)]
pub struct ScanPreview {
    pub requested_path: String,
    pub would_scan: bool,
}

#[tauri::command]
pub fn scan_folder_preview(path: String) -> ScanPreview {
    log::info!("scan_folder_preview requested for {path}");
    ScanPreview {
        requested_path: path,
        would_scan: true,
    }
}
