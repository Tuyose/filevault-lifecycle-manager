# UI Migration Plan

## Strategy

Migrate ONE SCREEN AT A TIME. Each screen gets its own commit.

**Order:** Sidebar → Overview → Analytics → Files → Watch Folders → Cleanup → History → Settings

**Integration pattern:** New shadcn-based UI replaces old Tailwind-v3 UI while keeping ALL backend logic (Rust commands, IPC calls, state management) intact.

---

## Phase 1: Foundation (commit 1)

1. Upgrade Tailwind v3 → v4 (`tailwind.config.js` → CSS-first config)
2. Add shadcn/ui components as needed (not all ~50 files, only used ones)
3. Install new deps: `lucide-react`, `motion`, `recharts`, `@radix-ui/*` (as needed)
4. Create `src/lib/utils.ts` (cn() helper)
5. Create `src/design-system/` with tokens, animations, shared types
6. Update `src/index.css` with new theme variables and Tailwind v4 import

---

## Phase 2: Sidebar (commit 2)

Replace `src/components/layout/Sidebar.tsx` with one matching `UI-OVERHAUL/src/app/components/Sidebar.tsx`:
- lucide-react icons
- motion animations
- shadcn nav styling
- Exact same navigation structure + routes

## Phase 3: Overview → Dashboard (commit 3)

Rewrite `DashboardPage.tsx` to match `OverviewScreen.tsx`:
- Health Score radial/gauge card
- Recommendation cards
- Mini charts
- All existing IPC calls preserved

## Phase 4: Analytics (commit 4, NEW screen)

Create `AnalyticsPage.tsx` matching `AnalyticsScreen.tsx`:
- Recharts-based trend charts
- Uses `getDashboardAnalytics()` IPC
- Add route + sidebar link

## Phase 5: Files → Scanner + Duplicates (commit 5)

Rewrite ScannerPage and DuplicatesPage to match `FilesScreen.tsx` + `CleanupScreen.tsx`:
- File table view with filters/search/sort
- Tab-based cleanup (duplicates, inactive, large, downloads)
- All existing IPC calls preserved

## Phase 6: Watch Folders (commit 6, NEW screen)

Create `WatchFoldersPage.tsx` matching `WatchFoldersScreen.tsx`:
- Watch folder cards with health indicators
- Uses `listWatchFolders()` etc.
- Add route + sidebar link

## Phase 7: History (commit 7, NEW screen)

Create `HistoryPage.tsx` matching `HistoryScreen.tsx`:
- Activity timeline with event types
- Uses `getScanHistory()` + duplicate data
- Add route + sidebar link

## Phase 8: Settings (commit 8)

Rewrite `SettingsPage.tsx` to match `SettingsScreen.tsx`:
- Tab-based settings UI
- All existing watch folder CRUD preserved

---

## Screen Migration Table

| Screen | Old File | New File | Reuse % | Backend Changes |
|--------|----------|----------|---------|----------------|
| Sidebar | `Sidebar.tsx` | same | 30% | None |
| Dashboard | `DashboardPage.tsx` | same | 60% | None |
| Analytics | — | `AnalyticsPage.tsx` (NEW) | — | None (uses existing IPC) |
| Scanner | `ScannerPage.tsx` | same | 40% | None |
| Duplicates | `DuplicatesPage.tsx` | same | 30% | None |
| Watch Folders | — | `WatchFoldersPage.tsx` (NEW) | — | None (uses existing IPC) |
| Cleanup | — | `CleanupPage.tsx` (NEW) | — | None (uses existing IPC) |
| History | — | `HistoryPage.tsx` (NEW) | — | None (uses existing IPC) |
| Settings | `SettingsPage.tsx` | same | 40% | None |

## NEVER BREAK

- Scanner (recursive walk + hash + progress)
- Duplicate detection (BLAKE3 grouping)
- Watch folders CRUD
- Scheduler (background loop)
- Analytics snapshots
- All Tauri commands
- Database migrations
