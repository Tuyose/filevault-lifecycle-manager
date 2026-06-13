# Database schema

The database is a single SQLite file located at the OS-specific
`app_data_dir` (`%APPDATA%/com.filevault.lifecycle/filevault.db` on
Windows, `~/Library/Application Support/...` on macOS, etc.). It runs
in WAL mode and uses foreign keys.

The schema lives in `src-tauri/migrations/`. Migrations are embedded
into the binary by `sqlx::migrate!` and applied exactly once per
process by `Database::run_migrations`.

## Tables

### `files`

One row per file the scanner has ever seen.

| Column          | Type    | Notes                                                   |
| --------------- | ------- | ------------------------------------------------------- |
| `id`            | TEXT PK | UUIDv4, generated on insert                             |
| `original_path` | TEXT    | Path as it was when the file was first indexed          |
| `current_path`  | TEXT    | Updated whenever the file moves (archive, trash, etc.)  |
| `file_name`     | TEXT    | Basename; denormalised for fast filtering               |
| `extension`     | TEXT?   | Lowercased, no leading dot                              |
| `size_bytes`    | INTEGER |                                                         |
| `hash`          | TEXT?   | BLAKE3 hex digest; null until the file is hashed        |
| `status`        | TEXT    | CHECK in `(active, archived, trashed, deleted)`         |
| `created_at`    | TEXT    | ISO 8601, UTC                                           |
| `modified_at`   | TEXT?   | Last filesystem mtime we've observed                    |
| `last_seen_at`  | TEXT    | Updated on every scan that touches the file             |
| `archived_at`   | TEXT?   | Set when `status` becomes `archived`                    |
| `trashed_at`    | TEXT?   | Set when `status` becomes `trashed`                     |
| `deleted_at`    | TEXT?   | Set when `status` becomes `deleted`                     |

Indexes:

- `idx_files_status` — powers the Archive / Trash / Duplicates views
- `idx_files_hash` — needed for fast duplicate lookups once hashing
  is in place
- `idx_files_last_seen_at` — drives "what's changed since last scan"

### `lifecycle_events`

Append-only audit log. One row per state change.

| Column         | Type    | Notes                                                                                |
| -------------- | ------- | ------------------------------------------------------------------------------------ |
| `id`           | TEXT PK | UUIDv4                                                                               |
| `file_id`      | TEXT    | FK → `files.id` (cascade delete)                                                     |
| `event_type`   | TEXT    | CHECK in `(discovered, hashed, archived, restored, trashed, purged, updated)`        |
| `from_path`    | TEXT?   | For move-style events; null otherwise                                                |
| `to_path`      | TEXT?   | For move-style events; null otherwise                                                |
| `created_at`   | TEXT    | ISO 8601, UTC                                                                        |
| `metadata_json`| TEXT?   | Free-form JSON for event-specific extras (e.g. `{ "duration_ms": 42 }`)              |

Indexes:

- `idx_lifecycle_events_file_id` — per-file history
- `idx_lifecycle_events_created_at` — chronological queries

### `app_settings`

Generic key/value store. Values are stored as JSON strings so a single
row can host any shape without schema changes.

| Column  | Type    | Notes                                |
| ------- | ------- | ------------------------------------ |
| `key`   | TEXT PK | e.g. `trash.grace_period_seconds`    |
| `value` | TEXT    | JSON-encoded (string, number, array) |

## Allowed status transitions

`FileLifecycle::can_transition` is the single source of truth:

| From       | To         |
| ---------- | ---------- |
| active     | archived   |
| active     | trashed    |
| archived   | active     |
| archived   | trashed    |
| trashed    | active     |
| trashed    | deleted    |

Any other combination is rejected at the service layer before the
SQL UPDATE.

## Future tables (not in MVP)

- `duplicate_groups` / `duplicate_group_members` — once the
  detector runs, this lets us cache the latest grouping so the UI
  can render without re-hashing.
- `scan_runs` — record of each scan invocation (root path, start
  time, end time, files touched) for the dashboard's history view.
- `archive_blobs` — metadata for blobs in the archive root, with
  content-addressed paths keyed by BLAKE3 hash.
