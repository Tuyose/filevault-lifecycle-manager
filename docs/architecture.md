# Architecture

FileVault is a Tauri 2 application. The Tauri shell hosts a single
window whose contents are a React SPA; the React side talks to a Rust
backend exclusively through Tauri's `invoke` IPC bridge. There is no
HTTP server in the loop and no data ever leaves the host.

## Layered view

```
┌──────────────────────────────────────────────────────────────┐
│  React + TypeScript  (src/)                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │Dashboard │  │ Scanner  │  │ Archive  │  │  Trash   │ ...  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘      │
│       └──────────────┴──────────────┴──────────────┘          │
│                         │ lib/ipc.ts (typed wrapper)         │
└─────────────────────────┼────────────────────────────────────┘
                          │  Tauri IPC  (invoke / events)
┌─────────────────────────▼────────────────────────────────────┐
│  Rust core  (src-tauri/src/)                                 │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────┐           │
│  │ commands/  │  │ services/   │  │  core/       │           │
│  │ IPC entry  │─▶│ orchestrate │─▶│  pure logic  │           │
│  │ points     │  │ repos+core  │  │  (hashing…)  │           │
│  └─────┬──────┘  └──────┬──────┘  └──────────────┘           │
│        │               │                                     │
│        │        ┌──────▼──────┐                              │
│        │        │ db/         │  ── sqlx pool ──▶ SQLite     │
│        │        │ repositories│                              │
│        │        └─────────────┘                              │
│        │                                                     │
│        │   models/ — domain types (FileStatus, LifecycleEvent)│
│        │   errors/ — AppError + AppResult                    │
│        ▼                                                     │
│   AppState { database: Arc<Database> }                       │
└──────────────────────────────────────────────────────────────┘
```

### Frontend (`src/`)

- **Feature folders** (`features/<name>/<Name>Page.tsx`): one folder
  per top-level route. Each page owns its own state, effects, and
  component composition. Cross-feature imports are discouraged.
- **`components/`**: stateless, presentational pieces reused across
  features (`StatCard`, `Sidebar`, `PlaceholderPage`).
- **`hooks/`**: shared React hooks (`useTauriCommand` for the
  common "call Rust once on mount" pattern).
- **`lib/ipc.ts`**: the only place that knows the names of Tauri
  commands and their argument shapes. All IPC traffic goes through
  this module so the rest of the frontend is decoupled from
  command names and argument casing.
- **`types/`**: TypeScript mirrors of the structs returned by Rust
  commands. Rust is the source of truth — keep these in sync manually
  for now (codegen will come later).
- **`app/`**: `App.tsx` (shell) and `routes.tsx` (route table).

### Backend (`src-tauri/src/`)

- **`main.rs`** is a one-liner that delegates to `lib::run()`.
- **`lib.rs`** builds the Tauri app: registers plugins, runs the
  `setup` hook (which opens the DB, runs migrations, and inserts
  `AppState` into Tauri's managed state), and registers all
  `#[tauri::command]` handlers.
- **`commands/`** are thin: they decode arguments, call into a
  service, and serialise the result. No business logic, no SQL.
- **`services/`** orchestrate: a service may call one or more
  repositories and one or more `core/` modules. They are also the
  natural place to add cross-cutting concerns (logging, telemetry
  hooks, transactions).
- **`core/`** holds pure logic with no IO of its own. `scanner`,
  `archive`, `trash`, `duplicate_detector`, and `file_lifecycle`
  (a small state machine that decides whether a given status
  transition is allowed).
- **`db/`** owns the `sqlx::SqlitePool`. The connection is wrapped
  in a `Database` struct that also tracks whether migrations have
  been run, so calling `run_migrations` twice is a no-op.
  Repositories (`file_repository`, `lifecycle_repository`) expose
  typed query methods and translate between `sqlx::FromRow` types
  and our domain models.
- **`models/`** are the domain types shared across the codebase.
  Enums (`FileStatus`, `LifecycleEventType`) carry an `as_str` /
  `from_db` pair so the SQLite representation is encapsulated.
- **`errors/`** is `thiserror`-based. The single `AppError` enum is
  what command handlers return across the IPC boundary (Tauri
  serialises it via `Display`).

## State management

- Tauri-managed `AppState` (synchronous from Rust's perspective).
- The frontend uses plain `useState` / `useEffect` for now. State that
  needs to be shared across many components will be lifted to Zustand
  once a real feature (e.g. the scanner progress) demands it.

## IPC contract

All commands live in `src-tauri/src/commands/`. Their names and
argument shapes are mirrored in `src/lib/ipc.ts` and `src/types/ipc.ts`.
The dashboard actively calls `get_app_status` and `get_database_status`
on mount, which proves the bridge is live end-to-end.

## Logging

The Rust side uses `log` + `env_logger`. The default filter is
`info`. Tauri commands log at `info` when they accept work, and core
modules can escalate to `warn` / `error` for recoverable and
unrecoverable issues respectively.

## Build pipeline

- `pnpm tauri dev` — Vite dev server on `localhost:1420`; the Tauri
  window points at it and reloads on file changes.
- `pnpm tauri build` — runs `pnpm build` (tsc + vite build), then
  compiles the Rust crate in release mode and bundles installers for
  the host platform.
