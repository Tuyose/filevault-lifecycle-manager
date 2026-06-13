# FileVault Lifecycle Manager

> Local-first desktop app for scanning, archiving, dedup-detecting, and
> soft-deleting files — with a full audit trail of every state change.

FileVault is built for users who want full control over their files
without trusting a cloud service. The whole pipeline runs on your
machine: scanning, BLAKE3 hashing, archiving, duplicate detection, and
the soft-delete trash with a configurable grace period.

---

## Tech stack

| Layer        | Choice                                  |
| ------------ | --------------------------------------- |
| Shell        | Tauri 2 (Rust + system webview)         |
| UI           | React 19 + TypeScript + Vite 7          |
| Styling      | Tailwind CSS 3 (custom `vault-*` theme) |
| Routing      | React Router v7                         |
| Backend      | Rust (stable, edition 2021, tokio)      |
| Database     | SQLite via `sqlx` (WAL mode)            |
| Hashing      | BLAKE3 via `blake3` crate               |
| Filesystem   | `walkdir` for recursive traversal       |
| Errors       | `thiserror`                             |
| Packaging    | `pnpm`                                  |

---

## Project layout

```
filevault-lifecycle-manager/
├─ src/                         # React + TypeScript frontend
│  ├─ app/                      # App shell, route definitions
│  ├─ components/
│  │  ├─ layout/                # Sidebar, PlaceholderPage
│  │  └─ ui/                    # StatCard, reusable widgets
│  ├─ features/
│  │  ├─ dashboard/             # Live IPC + DB stats
│  │  ├─ scanner/               # Recursive scanner with progress, pause/cancel, history
│  │  ├─ archive/               # Placeholder
│  │  ├─ trash/                 # Placeholder
│  │  ├─ duplicates/            # Placeholder
│  │  └─ settings/              # Placeholder
│  ├─ hooks/                    # useTauriCommand
│  ├─ lib/ipc.ts                # Typed Tauri invoke wrapper
│  ├─ types/ipc.ts              # Shared TS types mirroring Rust structs
│  └─ main.tsx
│
├─ src-tauri/                   # Rust backend
│  ├─ src/
│  │  ├─ main.rs                # Desktop entrypoint → lib::run()
│  │  ├─ lib.rs                 # Tauri builder, AppState, plugin/command registration
│  │  ├─ commands/              # Tauri IPC handlers
│  │  │  ├─ mod.rs
│  │  │  ├─ system_commands.rs  # get_app_status, get_database_status
│  │  │  ├─ scanner_commands.rs # scan_folder, get_scan_stats, get_scan_history,
│  │  │  │                      #   pause_scan, resume_scan, cancel_scan
│  │  │  ├─ archive_commands.rs # Placeholder
│  │  │  └─ trash_commands.rs   # Placeholder
│  │  ├─ core/                  # Domain logic (zero Tauri imports)
│  │  │  ├─ mod.rs
│  │  │  ├─ scanner.rs          # WalkDir walker, pre-count, progress callback, pause/cancel check
│  │  │  ├─ scan_controller.rs  # AtomicBool + Notify for pause/resume/cancel signalling
│  │  │  ├─ archive.rs          # Placeholder
│  │  │  ├─ trash.rs            # Placeholder
│  │  │  ├─ duplicate_detector.rs # Placeholder
│  │  │  └─ file_lifecycle.rs   # State machine: FileLifecycle::can_transition
│  │  ├─ services/
│  │  │  ├─ mod.rs
│  │  │  ├─ file_service.rs     # Scanner orchestration (progress + controller wiring)
│  │  │  ├─ hash_service.rs     # BLAKE3 wrapper
│  │  │  ├─ retention_service.rs# Placeholder
│  │  │  └─ restore_service.rs  # Placeholder
│  │  ├─ db/
│  │  │  ├─ mod.rs
│  │  │  ├─ connection.rs       # SqlitePool, WAL, migration runner, ping
│  │  │  ├─ migrations.rs       # Migration module doc
│  │  │  └─ repositories/
│  │  │     ├─ mod.rs
│  │  │     ├─ file_repository.rs       # File upsert, stats, find by path
│  │  │     ├─ lifecycle_repository.rs   # Event CRUD
│  │  │     └─ scan_run_repository.rs    # Scan persistence
│  │  ├─ models/
│  │  │  ├─ mod.rs
│  │  │  ├─ file_record.rs      # FileRecord, FileStatus enum
│  │  │  ├─ lifecycle_event.rs  # LifecycleEvent, LifecycleEventType enum
│  │  │  ├─ app_settings.rs     # Key/value setting
│  │  │  └─ scan_run.rs         # ScanRun, ScanRunStatus enum
│  │  └─ errors/
│  │     ├─ mod.rs
│  │     └─ app_error.rs        # AppError enum (7 variants) + AppResult
│  ├─ migrations/               # Embedded SQL (sqlx::migrate!)
│  │  ├─ 0001_initial_schema.sql
│  │  ├─ 0002_files_unique_original_path.sql
│  │  └─ 0003_scan_runs.sql
│  ├─ tests/
│  │  └─ scanner_test.rs        # Integration test: insert + update + no duplicates
│  ├─ capabilities/default.json # Tauri permissions
│  └─ tauri.conf.json
│
├─ docs/
│  ├─ architecture.md
│  ├─ database-schema.md
│  └─ roadmap.md
```

---

## Scanner MVP — current state

The scanner is the only fully implemented feature. It provides:

### Real-time scan with progress streaming

When the user clicks **Scan folder**, the Rust side:

1. **Pre-count walk**: A fast `WalkDir` pass (no `metadata()`, no DB) counts
   every regular file in the tree. Hidden files (`.` prefix) and SQLite
   sidecar paths (`-wal`, `-shm`) are excluded via `filter_entry`.
2. **Scanning phase**: A second walk processes each file:
   - `tokio::fs::metadata` reads `created_at`, `modified_at`, `size_bytes`
   - `FileRepository::upsert` inserts or updates the row in `files`
   - A `ScanProgress` event is sent via Tauri's event system
3. **Completion**: The final `ScanSummary` is returned as the command result

### Progress events (Tauri event: `scan:progress`)

| Field | Description |
|---|---|
| `phase` | `"Counting"` → `"Scanning"` → `"Done"` |
| `processed` | Files processed so far |
| `total_files` | Total file count from pre-count |
| `current_path` | Full path of the file being processed |
| `current_dir` | Parent directory of the current file |

### Concurrency control: pause / resume / cancel

The `ScanController` (`core/scan_controller.rs`) uses two `AtomicBool`
flags (cancel + paused) and a `tokio::sync::Notify` for wakeup:

- **Pause**: The scanner checks `is_paused()` after every file and, when
  true, calls `wait_if_paused().await` which blocks until `resume()` is
  called (via `Notify::notify_waiters()`).
- **Cancel**: Sets `cancel = true`; the scanner observes it at the next
  file boundary, breaks the walk, and returns a partial `ScanSummary`.
  Cancel also wakes a paused scan so it can exit immediately.
- **Reset**: `scan_folder` calls `controller.reset()` before starting, so
  old flags don't carry across runs.

### Scan history

After every scan (success, cancellation, or error), a `scan_runs` row
is inserted with the full summary. The frontend fetches the 20 most
recent runs via `get_scan_history` and renders them in a table.

### Database persistence

**`files` table** — one row per file ever seen:

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUIDv4 |
| `original_path` | TEXT | Stable identity; unique constraint via partial index |
| `current_path` | TEXT | Updated on archive/trash moves (future) |
| `file_name` | TEXT | Denormalised for filtering |
| `extension` | TEXT? | Lowercased, no leading dot |
| `size_bytes` | INTEGER | |
| `hash` | TEXT? | BLAKE3 hex (future) |
| `status` | TEXT | `'active'`, `'archived'`, `'trashed'`, `'deleted'` |
| `created_at` | TEXT | ISO 8601 UTC |
| `modified_at` | TEXT? | Filesystem mtime |
| `last_seen_at` | TEXT | Updated every scan touch |
| `archived_at` / `trashed_at` / `deleted_at` | TEXT? | State transition timestamps |

**Upsert logic** (`FileRepository::upsert`):
1. Look up by `original_path` where `status != 'deleted'`
2. Not found → `INSERT` → `UpsertOutcome::Inserted`
3. Found → `UPDATE current_path, size_bytes, modified_at, last_seen_at` → `UpsertOutcome::Updated`
4. Unique violation (lost race) → retry as update

**`scan_runs` table** — one row per scan invocation:

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUIDv4 |
| `root_path` | TEXT | Scanned directory |
| `started_at` / `finished_at` | TEXT | ISO 8601 UTC |
| `total_seen` / `inserted` / `updated` / `errors` / `total_bytes` | INTEGER | Summary counters |
| `status` | TEXT | `'completed'`, `'cancelled'`, `'error'` |

**Migrations** (`src-tauri/migrations/`):
- `0001_initial_schema.sql` — `files`, `lifecycle_events`, `app_settings`
- `0002_files_unique_original_path.sql` — partial unique index on `original_path`
- `0003_scan_runs.sql` — `scan_runs` table + DESC index on `finished_at`

### Error handling

- Each file is wrapped in a `match`; errors increment the error counter
  but do not abort the scan
- Up to 10 error samples (path + message) are returned in `error_samples`
- Empty or non-existent root paths return an explicit error string to the UI
- Permission-denied files are caught by `walkdir` and reported as entry errors

---

## IPC contract

All Rust → JS communication happens through Tauri's `invoke` bridge.
`lib/ipc.ts` is the single point of contact — every command name and
argument shape is defined there. The TypeScript types in `types/ipc.ts`
mirror the Rust structs returned by commands.

### Available commands

| Command | Args | Returns | Event(s) |
|---|---|---|---|
| `get_app_status` | — | `AppStatus` | — |
| `get_database_status` | — | `DatabaseStatus` | — |
| `scan_folder` | `path: string` | `ScanSummary` | `scan:progress` |
| `scan_folder_preview` | `path: string` | `ScanPreview` | — |
| `get_scan_stats` | — | `FileStats` | — |
| `get_scan_history` | — | `Vec<ScanRun>` | — |
| `pause_scan` | — | void | — |
| `resume_scan` | — | void | — |
| `cancel_scan` | — | void | — |

---

## AppState

Managed by Tauri and accessible to every command handler:

```
AppState {
    database:  Arc<Database>       // SqlitePool + migration tracker
    files:     Arc<FileService>    // Scanner + repository orchestration
    scan_controller: Arc<ScanController>  // AtomicBool pause/cancel flags
}
```

Cloning `AppState` is cheap because all fields are `Arc`-wrapped.

---

## Setup

Requirements:

- Node.js ≥ 20
- pnpm ≥ 9
- Rust toolchain (stable, edition 2021) + system deps for Tauri 2 —
  see https://v2.tauri.app/start/prerequisites/

```bash
pnpm install
```

## Develop

```bash
pnpm tauri dev
```

Vite dev server on `http://localhost:1420`. React HMR works; Rust
changes trigger a full recompile.

## Build

```bash
pnpm tauri build
```

The bundled installer is written to `src-tauri/target/release/bundle/`.
A bare `.exe` is at `src-tauri/target/release/filevault-lifecycle-manager.exe`.

## Test

```bash
cd src-tauri
cargo test --test scanner_test
```

The integration test creates a temp directory with 3 files, runs the
scanner twice, and asserts:
- First pass: 3 inserted, 0 updated, 0 errors
- Second pass: 0 inserted, 3 updated, 0 errors
- Grand total: 3 rows (no duplicates)

---

## Planned modules

| Module              | Status   | Notes                                         |
| ------------------- | -------- | --------------------------------------------- |
| Scanner             | **MVP**  | Recursive walk, pre-count, progress events, pause/resume/cancel, history |
| Hasher (BLAKE3)     | scaffold | `hash_service.rs` wired; not called yet        |
| Archive             | scaffold | Engine + dummy command                         |
| Trash (soft delete) | scaffold | Engine + dummy command                         |
| Restore             | scaffold | Reverse path of archive/trash                  |
| Duplicate detection | scaffold | Two-stage size+hash filter, then BLAKE3        |
| Retention policy    | scaffold | Driven by `app_settings`                       |
| Settings UI         | scaffold | Reads/writes `app_settings` (key → JSON)       |

---

## File lifecycle

A file is always in exactly one of these states, recorded both as a
column on the `files` row and as a series of `lifecycle_events` for
audit:

```
   ┌─────────┐  archive  ┌──────────┐
   │ Active  │ ─────────►│ Archived │ ──┐
   └─────────┘           └──────────┘   │ restore
        │  trash            ▲           ▼
        ▼                   │       ┌─────────┐
   ┌─────────┐  restore     └───────│ Active  │
   │ Trashed │ ─────────────────────┘
   └─────────┘
        │  purge (after grace period)
        ▼
   ┌─────────┐
   │ Deleted │
   └─────────┘
```

Transitions go through `core::file_lifecycle::FileLifecycle::can_transition`,
the single source of truth for state machine rules.

---

## CI

This repository uses GitHub Actions for:

- **Frontend validation** — TypeScript check + Vite build on every push/PR
- **Rust tests** — `cargo fmt`, `cargo test --all`, `cargo check --all-targets`
- **Windows desktop build** — Manual `workflow_dispatch` producing MSI installer + portable `.exe`

Workflows: `.github/workflows/ci.yml`, `.github/workflows/windows-build.yml`

## License

TBD.
