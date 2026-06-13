//! Domain errors. `thiserror` derives ergonomic `Display` and `Error`
//! impls; `AppError::into_string` is what command handlers return across
//! the Tauri IPC boundary (Tauri serialises errors via `Display`).

pub mod app_error;

pub use app_error::{AppError, AppResult};
