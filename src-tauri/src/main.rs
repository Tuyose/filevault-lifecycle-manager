// FileVault Lifecycle Manager - desktop entrypoint.
// All app wiring lives in the lib crate so the same code can be reused
// on mobile targets and tested in isolation.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    filevault_lifecycle_manager_lib::run();
}
