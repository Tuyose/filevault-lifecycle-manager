# Scan Stability Debug Findings

## Root causes identified

### 1. `controller.reset()` called on every `scan_folder` invocation
- File: `src-tauri/src/commands/scanner_commands.rs:57`
- Every call resets the controller, silently cancelling any active scan
- If frontend inadvertently calls `scan_folder` again, the running scan dies

### 2. `scan_folder` is a blocking command
- Returns `Result<ScanSummary, String>` — blocks until scan completes
- Frontend promise dropped on navigation → appears cancelled
- Should be fire-and-forget with async spawn

### 3. `ScanJobManager` created but never populated
- `core/scan_job.rs` defines the struct + methods
- But `scan_folder` never calls `set()`, `update_progress()`, etc.
- `get_active_scan_job()` always returns `None`

### 4. Frontend polls `get_active_scan_job()` but backend never updates it
- Polling every 1s returns no data because ScanJobManager is empty
- Progress only comes from `scan:progress` events (which do work)
- But job-level metadata (status, path, source) is missing

### 5. Route state `autoStart` can re-trigger
- No guard against `startScan` being called during an active scan
- `startScan` in scan-store.tsx uses `crypto.randomUUID()` to create a local job
  before calling backend, but doesn't check backend active job first

## Fix summary
1. Refactor `scan_folder` → `start_scan_job` with `tauri::async_runtime::spawn`
2. Populate `ScanJobManager` during scan lifecycle
3. Update frontend to use `start_scan_job` + poll + events
4. Add idempotency guard: never start a second scan if one is active
5. Remove `controller.reset()` from command — call only in spawned task
6. Add `job_id` to progress events for dedup
