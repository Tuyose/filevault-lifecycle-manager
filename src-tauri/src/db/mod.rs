//! Database layer. Owns the SQLite pool and migration runner; hands out
//! repositories to the rest of the app. Keeping the surface small means
//! the rest of the codebase can stay ignorant of `sqlx` details.

pub mod connection;
pub mod migrations;
pub mod repositories;

pub use connection::Database;
