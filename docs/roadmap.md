# Roadmap

The project is being built in vertical slices. Each milestone is
shippable on its own — what's in the milestone works end-to-end
(even if the surface area is small), nothing is a stub-only spike.

## ✅ M0 — Skeleton (this commit)

- Tauri 2 + React + TypeScript project scaffold
- Tailwind wired up with the FileVault theme
- Rust crates pulled in: `sqlx`, `tokio`, `serde`, `serde_json`,
  `chrono`, `uuid`, `blake3`, `thiserror`, `anyhow`
- Layered backend (`commands` → `services` → `core` + `db` + `models`
  + `errors`) with stub implementations
- SQLite connection + WAL mode + first migration
  (`files`, `lifecycle_events`, `app_settings`)
- Dummy Tauri commands to prove the IPC bridge:
  `get_app_status`, `get_database_status`, `scan_folder_preview`
- Sidebar + Dashboard / Scanner / Archive / Trash / Duplicates /
  Settings placeholder pages
- Dashboard actively calls Rust on mount, showing live status

## M1 — Real scanner

- Recursive directory walk with skip rules
- BLAKE3 hashing pipeline (chunked async I/O)
- Streamed progress events from Rust to React via Tauri's event API
- Persist each discovered file as a `files` row + `discovered` /
  `hashed` lifecycle events
- Scanner page: live progress bar, file count, throughput

## M2 — Archive

- Archive root configurable via `app_settings`
- Move file into archive, update `current_path`, set
  `status = archived`, emit `archived` event
- Archive page: list view, multi-select, restore button (calls the
  restore service)
- Verify BLAKE3 hash on archive

## M3 — Soft-delete trash

- Move-to-trash implementation (`.filevault-trash/...` layout)
- Configurable grace period (default 30 days)
- Trash page: bulk restore, manual purge, countdown to auto-purge
- Retention service runs on app start and on a timer

## M4 — Duplicate detection

- Two-stage filter: `(size, partial_hash)` then BLAKE3
- Duplicate groups persisted (new tables)
- Duplicates page: per-group reclaimable bytes, keep-one / bulk
  archive / bulk trash actions

## M5 — Settings & polish

- Settings page wired to `app_settings` (grace period, archive root,
  excluded paths, hash chunk size)
- Theming pass, error toasts, keyboard shortcuts
- Bundle installers for Windows / macOS / Linux

## M6 — Restore & history

- Restore service handles archive → original path and trash → original
  path with collision detection
- Per-file history view: timeline of lifecycle events
- Exportable audit log (CSV / JSON)

## Out of scope (for now)

- Cloud sync, multi-device, account system
- Indexing network drives / cloud mounts
- Real-time file watching (currently scan-driven)
- AV / malware scanning
- Encryption at rest (planned, not in any milestone yet)
