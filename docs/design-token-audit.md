# Design Token Audit — FileVault

Generated: 2026-06-14

## Source of truth: `src/index.css`

### Audit Results

#### ✅ Present & Correct (shadcn-compatible)

| Token | Dark Value | Light Value | Status |
|-------|-----------|-------------|--------|
| `--background` | `#07070F` | `#F8F8FC` | ✅ |
| `--foreground` | `#EDEDFD` | `#1A1A2E` | ✅ |
| `--card` | `#0D0D1A` | `#FFFFFF` | ✅ |
| `--card-foreground` | `#EDEDFD` | `#1A1A2E` | ✅ |
| `--primary` | `#6366F1` | `#6366F1` | ✅ (same accent) |
| `--primary-foreground` | `#FFFFFF` | `#FFFFFF` | ✅ |
| `--secondary` | `#13131F` | `#F0F0F5` | ✅ |
| `--muted` | `#10101C` | `#F0F0F5` | ✅ |
| `--muted-foreground` | `#6060A0` | `#7070A0` | ✅ |
| `--accent` | `#6366F1` | `#6366F1` | ✅ (mirrors primary) |
| `--destructive` | `#EF4444` | `#EF4444` | ✅ |
| `--border` | `rgba(100,100,220,0.1)` | `rgba(0,0,0,0.08)` | ✅ |
| `--ring` | `#6366F1` | `#6366F1` | ✅ |
| `--radius` | `0.75rem` | (inherits) | ✅ 12px base |

#### ✅ Legacy vault compat (mapped correctly)

| Legacy Token | Maps To | Status |
|-------------|---------|--------|
| `--color-vault-bg` | `#07070F` (dark) / `#F8F8FC` (light) | ✅ same as `--background` |
| `--color-vault-surface` | `#0D0D1A` (dark) / `#FFFFFF` (light) | ✅ same as `--card` |
| `--color-vault-border` | `rgba(100,100,220,0.1)` (dark) / `rgba(0,0,0,0.08)` (light) | ✅ same as `--border` |
| `--color-vault-accent` | `#6366F1` | ✅ same as `--primary` |
| `--color-vault-muted` | `#6060A0` (dark) / `#7070A0` (light) | ✅ same as `--muted-foreground` |

#### ⚠️ Warnings (safe but should be documented)

1. **Legacy vault variables are hardcoded** in `@theme inline` instead of being mapped via `var()`. This creates a second source of truth. Fix: map them.
2. **Chart colors are the same for both themes** — likely intentional, chart readability.
3. **Hardcoded inline styles still exist** in most page components (`style={{ color: "#EDEDFD" }}`) — acceptable during migration, should eventually reference CSS variables.

#### ❌ Issues Found

| Issue | Location | Severity | Fix |
|-------|----------|----------|-----|
| Legacy vault vars not mapped to shadcn vars | `@theme inline` lines 45-49 | Medium | Use `var(--card)` etc. |
| `--popover-foreground` not defined in light mode | `.light` block | Low | Add definition |
| `--input` not defined in light mode | `.light` block | Low | Add definition |
| `--switch-background` referenced in theme but not in `:root` / `.light` | `@theme inline` line 112 was removed | Low | Remove or define |

### Recommendations

1. **Map legacy vault vars** — Replace hardcoded values with `var(--card)`, etc.
2. **Complete light mode token parity** — Add missing `popover-foreground`, `input`, `ring` to `.light`.
3. **Remove unused `@theme` tokens** — `switch-background` if not used.
4. **Gradually migrate inline styles to CSS variables** — Not urgent, tracked as tech debt.
