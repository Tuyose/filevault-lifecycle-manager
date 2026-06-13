//! Application services — orchestrate repositories + core modules to
//! perform user-facing actions. Each service is a thin façade so the
//! command layer never reaches into the DB directly.

pub mod file_service;
pub mod hash_service;
pub mod retention_service;
pub mod restore_service;
pub mod scheduler_service;
