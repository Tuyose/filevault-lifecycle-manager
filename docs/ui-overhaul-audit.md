# UI Overhaul Audit

Source: `C:\Users\Yusuf\Desktop\UI-OVERHAUL`
Generated: 2026-06-13

## Stack Analysis

| Dimension | Value |
|-----------|-------|
| Framework | Vite 6.3 + React 18.3 |
| Language | TypeScript |
| Styling | Tailwind v4 (`@tailwindcss/vite`, CSS-first config) |
| Component Library | shadcn/ui (Radix primitives + CVA + clsx + tailwind-merge) |
| Animation | `motion` (framer-motion v12) |
| Icons | lucide-react + @mui/icons-material |
| Charts | Recharts 2.15 |
| Routing | react-router v7 (client-side) |
| Form | react-hook-form |
| Drag & Drop | react-dnd |
| Notifications | sonner |
| Date handling | date-fns |

**Verdict: React + Vite + Tailwind v4 + shadcn/ui + motion.**

---

## Design System

### Colors (from `theme.css`)

Token values (dark theme):

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `#07070F` | Page background |
| `--foreground` | `#EDEDFD` | Text |
| `--card` | `#0D0D1A` | Card surface |
| `--card-foreground` | `#EDEDFD` | Card text |
| `--primary` | `#6366F1` | Primary accent (indigo) |
| `--secondary` | `#13131F` | Secondary surface |
| `--muted` | `#10101C` | Muted surface |
| `--muted-foreground` | `#6060A0` | Muted text |
| `--accent` | `#6366F1` | Same as primary |
| `--destructive` | `#EF4444` | Error/danger |
| `--border` | `#1E1E2E` | Borders |
| `--ring` | `#6366F1` | Focus rings |
| `--radius` | `0.75rem` | `12px` base radius |

### Typography

- Font: system sans-serif (inherits from Tailwind)
- Base size: `14px`
- shadcn default: `16px` (not active for this design)

### Spacing

Standard 4px grid via Tailwind (`p-4` = 16px, `gap-4` = 16px, etc.)

### Border Radius

- Base: `12px` (`0.75rem`)
- shadcn default: `0.5rem` (overridden)

### Shadows

Not explicitly defined — relies on Tailwind defaults.

### Animations

- `motion` library with `framer-motion` API
- Page transitions: `AnimatePresence` + `motion.div`
- Card hover: subtle scale/opacity
- Micro-interactions: 200-300ms ease

### Icon System

- Primary: `lucide-react` (tree-shakable, 24px default)
- Secondary: `@mui/icons-material` (used in some UI components)

---

## Component Inventory

### Shared UI Components (shadcn/ui)

All in `src/app/components/ui/`:

- accordion, alert, alert-dialog, aspect-ratio, avatar, badge
- breadcrumb, button, calendar, card, carousel, chart
- checkbox, collapsible, command, context-menu, dialog
- drawer, dropdown-menu, form, hover-card, input, input-otp
- label, menubar, navigation-menu, pagination, popover, progress
- radio-group, resizable, scroll-area, select, separator
- sheet, sidebar, skeleton, slider, sonner, switch
- table, tabs, textarea, toggle, toggle-group, tooltip, utils

### Screen Components

| File | Screen | Equiv. in FileVault |
|------|--------|---------------------|
| `OverviewScreen.tsx` | Overview/Dashboard | `DashboardPage.tsx` |
| `AnalyticsScreen.tsx` | Analytics/Trends | None (new) |
| `FilesScreen.tsx` | Files/Scanner | `ScannerPage.tsx` + `DuplicatesPage.tsx` |
| `WatchFoldersScreen.tsx` | Watch Folders | `SettingsPage.tsx` (partial) |
| `CleanupScreen.tsx` | Cleanup/Recommendations | None (new) |
| `HistoryScreen.tsx` | History/Activity | `ScannerPage.tsx` (partial) |
| `SettingsScreen.tsx` | Settings | `SettingsPage.tsx` |
| `Sidebar.tsx` | Navigation | `Sidebar.tsx` |

---

## Screen Mapping

| FileVault Screen | UI-OVERHAUL Screen | Notes |
|-----------------|-------------------|-------|
| Dashboard (`DashboardPage.tsx`) | Overview (`OverviewScreen.tsx`) | Health score, metrics, recommendations all present |
| Scanner (`ScannerPage.tsx`) | Files (`FilesScreen.tsx`) | File table + scan trigger |
| Duplicates (`DuplicatesPage.tsx`) | Cleanup → Duplicates tab (`CleanupScreen.tsx`) | Tab-based cleanup UI |
| Settings (`SettingsPage.tsx`) | Settings (`SettingsScreen.tsx`) | Tab-based settings |
| — (none) | Analytics (`AnalyticsScreen.tsx`) | Trend charts, new feature |
| — (none) | Watch Folders (`WatchFoldersScreen.tsx`) | Dedicated screen, new |
| — (none) | Cleanup (`CleanupScreen.tsx`) | Recommendation engine UI |
| — (none) | History (`HistoryScreen.tsx`) | Activity timeline |

---

## Gap Analysis

| Missing in FileVault | Present in UI-OVERHAUL | Action |
|---------------------|----------------------|--------|
| Analytics charts | ✅ `AnalyticsScreen.tsx` (Recharts) | New screen |
| Dedicated Watch Folders UI | ✅ `WatchFoldersScreen.tsx` | New screen |
| Cleanup recommendation UI | ✅ `CleanupScreen.tsx` | New screen |
| Activity History timeline | ✅ `HistoryScreen.tsx` | New screen |
| Recharts dependency | ✅ | Add to package.json |
| lucide-react icons | ✅ | Already using (partial) |
| motion animations | ✅ `motion` library | Already using |
| shadcn/ui components | ✅ Full library | New dependency group |
| Tailwind v4 | ✅ `@tailwindcss/vite` | Need to upgrade from v3 |
