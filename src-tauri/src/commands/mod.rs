//! Tauri command handlers. Each submodule corresponds to a feature area
//! and exposes the IPC entry points invoked from the React frontend.

pub mod analytics_commands;
pub mod archive_commands;
pub mod scanner_commands;
pub mod system_commands;
pub mod trash_commands;
pub mod watch_folder_commands;
