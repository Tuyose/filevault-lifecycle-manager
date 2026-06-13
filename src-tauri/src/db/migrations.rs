//! Migration runner glue. The actual SQL files live under
//! `src-tauri/migrations/` and are embedded into the binary by sqlx at
//! compile time (`sqlx::migrate!` macro in `connection.rs`). This module
//! only exposes a typed wrapper so the rest of the codebase does not
//! depend on the `sqlx::migrate` path directly.
