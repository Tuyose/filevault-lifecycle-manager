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
| UI           | React 19 + TypeScript + Vite            |
| Styling      | Tailwind CSS 3                          |
| Routing      | React Router v7                         |
| Backend      | Rust (tokio async runtime)              |
| Database     | SQLite via `sqlx`                       |
| Hashing      | BLAKE3 (planned, dependency already in) |
| Errors       | `thiserror` + `anyhow`                  |
| Packaging    | `pnpm`                                  |

---

## Project layout

```
filevault-lifecycle-manager/
├─ src/                      # React + TypeScript frontend
│  ├─ app/                   # App shell, route definitions
│  ├─ components/            # Shared UI primitives
│  │  ├─ layout/             # Sidebar, page chrome
│  │  └─ ui/                 # Reusable widgets (StatCard, …)
│  ├─ features/              # One folder per top-level feature
│  │  ├─ dashboard/          # Live snapshot of the local core
│  │  ├─ scanner/            # Folder picker + scan preview
│  │  ├─ archive/            # Archived files
│  │  ├─ trash/              # Soft-deleted files
│  │  ├─ duplicates/         # Duplicate groups
│  │  └─ settings/           # App preferences
│  ├─ hooks/                 # Reusable React hooks
│  ├─ lib/                   # Frontend helpers (IPC client, etc.)
│  ├─ types/                 # Shared TypeScript types
│  └─ main.tsx
│
├─ src-tauri/                # Rust backend
│  ├─ src/
│  │  ├─ main.rs / lib.rs    # Tauri builder + setup hook
│  │  ├─ commands/           # IPC handlers (one file per feature)
│  │  ├─ core/               # Domain logic (scanner, archive, …)
│  │  ├─ services/           # Façades that compose core + DB
│  │  ├─ db/                 # sqlx pool, migrations, repositories
│  │  ├─ models/             # Domain types (FileStatus, …)
│  │  └─ errors/             # AppError + AppResult
│  ├─ migrations/            # Embedded SQL files
│  └─ tauri.conf.json
│
├─ docs/
│  ├─ architecture.md
│  ├─ database-schema.md
│  └─ roadmap.md
```

---

## Setup

Requirements:

- Node.js ≥ 20
- pnpm ≥ 9
- Rust toolchain (stable, edition 2021) + system deps for Tauri —
  see https://v2.tauri.app/start/prerequisites/

```bash
pnpm install
```

## Develop

```bash
pnpm tauri dev
```

This starts the Vite dev server on `http://localhost:1420` and launches
the native window pointing at it. Hot reload works for the React side;
Rust changes trigger a rebuild of the binary.

## Build a release binary

```bash
pnpm tauri build
```

The bundled installer / `.exe` is written to
`src-tauri/target/release/bundle/`.

---

## Planned modules

| Module              | Status   | Notes                                         |
| ------------------- | -------- | --------------------------------------------- |
| Scanner             | scaffold | Preview command wired; real walk in MVP-1     |
| Hasher (BLAKE3)     | scaffold | Service skeleton + dependency                 |
| Archive             | scaffold | Engine + dummy command                        |
| Trash (soft delete) | scaffold | Engine + dummy command                        |
| Restore             | scaffold | Reverse path of archive/trash                 |
| Duplicate detection | scaffold | Two-stage size+hash filter, then BLAKE3       |
| Retention policy    | scaffold | Driven by `app_settings`                      |
| Settings UI         | scaffold | Reads/writes `app_settings` (key → JSON)      |

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

Transitions go through `core::file_lifecycle::FileLifecycle::can_transition`
so the rules have a single source of truth.

---

## License

TBD.
