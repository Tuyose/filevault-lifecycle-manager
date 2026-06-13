import { useEffect, useState } from "react";

import { ipc } from "../../lib/ipc";
import type { AppStatus, DatabaseStatus, DuplicateGroup, ScanRun, ScanStats } from "../../types/ipc";
import { formatBytes, shortenPath, topDuplicateFolders } from "../../lib/folder-insights";
import { MiniChart } from "../../components/ui/MiniChart";
import { SkeletonCard } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";

type Status =
  | { kind: "loading" }
  | { kind: "ready"; app: AppStatus; db: DatabaseStatus; stats: ScanStats | null; groups: DuplicateGroup[]; history: ScanRun[] }
  | { kind: "error"; message: string };

/** Compute a pseudo "health score" 0–100 from duplicate density. */
function healthScore(stats: ScanStats, groups: DuplicateGroup[]): number {
  if (stats.total === 0) return 100;
  const dupFiles = groups.reduce((s, g) => s + g.total_files, 0);
  const ratio = dupFiles / Math.max(stats.active, 1);
  return Math.max(0, Math.round(100 - ratio * 40));
}

/** Build a sparkline from history scan totals, newest last. */
function trendLine<T>(history: T[], extract: (item: T) => number): number[] {
  return history.slice().reverse().map(extract);
}

export function DashboardPage() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [app, db, stats, groups, history] = await Promise.all([
          ipc.getAppStatus(),
          ipc.getDatabaseStatus(),
          ipc.getScanStats().catch(() => null),
          ipc.getDuplicateGroups().catch(() => [] as DuplicateGroup[]),
          ipc.getScanHistory().catch(() => [] as ScanRun[]),
        ]);
        if (!cancelled) setStatus({ kind: "ready", app, db, stats, groups: groups ?? [], history });
      } catch (err) {
        if (!cancelled) setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (status.kind === "loading") return <PageLoading />;
  if (status.kind === "error") return <PageError message={status.message} />;

  const { stats, groups, history } = status;
  const health = stats ? healthScore(stats, groups) : 100;
  const wasted = groups.reduce((s, g) => s + g.total_wasted_bytes, 0);
  const dupFiles = groups.reduce((s, g) => s + g.total_files, 0);
  const hotspots = topDuplicateFolders(groups, 3);

  // Simulated trends from history
  const fileTrend = trendLine(history, (r) => r.total_seen);
  const wastedTrend = history.length > 0
    ? history.map(() => Math.round(wasted / history.length)) // placeholder until we have per-run waste
    : [];

  // Insights
  const insights: { icon: string; text: string }[] = [];
  if (groups.length > 0) {
    const catCount = new Map<string, number>();
    for (const g of groups) {
      const ext = g.files[0]?.path.split(".").pop()?.toLowerCase() ?? "";
      const cat = ext === "apk" ? "APK" : ext === "zip" || ext === "tar" || ext === "gz" ? "archive" : "other";
      catCount.set(cat, (catCount.get(cat) ?? 0) + 1);
    }
    for (const [cat, count] of catCount) {
      if (count > 3) insights.push({
        icon: cat === "APK" ? "📦" : cat === "archive" ? "🗜" : "📄",
        text: `${count} duplicate ${cat} files found`,
      });
    }
  }
  if (hotspots.length > 0) {
    insights.push({
      icon: "🔥",
      text: `"${shortenPath(hotspots[0].path, 2)}" has ${formatBytes(hotspots[0].duplicate_bytes)} in duplicates`,
    });
  }
  insights.push({
    icon: "🛡",
    text: `All processing is local — nothing leaves your machine`,
  });

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-8 animate-fade-in">
      {/* ── Section 1: Health Overview ── */}
      <Section title="Health Overview">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <HealthCard
            label="Health Score"
            value={`${health}%`}
            hint={health > 80 ? "Good" : health > 50 ? "Needs attention" : "Critical"}
            color={health > 80 ? "emerald" : health > 50 ? "amber" : "rose"}
          />
          <HealthCard
            label="Reclaimable Space"
            value={formatBytes(wasted)}
            hint={`${dupFiles} duplicate files`}
            color="amber"
            trend={wastedTrend}
          />
          <HealthCard
            label="Duplicate Groups"
            value={groups.length.toString()}
            hint="across all scans"
          />
          <HealthCard
            label="Files Tracked"
            value={(stats?.total ?? 0).toString()}
            hint={stats ? formatBytes(stats.total_bytes) : ""}
            trend={fileTrend}
          />
        </div>
      </Section>

      {/* ── Section 2: Attention Required ── */}
      {insights.length > 0 && (
        <Section title="Attention Required">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {insights.slice(0, 3).map((insight, i) => (
              <ActionCard key={i} icon={insight.icon}>
                {insight.text}
              </ActionCard>
            ))}
          </div>
        </Section>
      )}

      {/* ── Section 3: Insights Feed ── */}
      <Section title="Insights">
        <div className="flex flex-col gap-3">
          {insights.length === 0 && (
            <div className="rounded-[14px] border border-vault-border bg-vault-surface p-5 text-sm text-vault-muted">
              Run a scan to see insights about your files.
            </div>
          )}
          {insights.map((insight, i) => (
            <InsightRow key={i} icon={insight.icon}>
              {insight.text}
            </InsightRow>
          ))}
        </div>
      </Section>

      {/* ── Section 4: Trends ── */}
      {fileTrend.length > 1 && (
        <Section title="Trends">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <TrendCard label="Tracked Files" data={fileTrend} color="rgb(94, 234, 212)" />
            <TrendCard
              label="Total Space"
              data={history.map((r) => r.total_bytes)}
              color="rgb(251, 191, 36)"
            />
            <TrendCard label="Reclaimable" data={history.map((r) => r.total_bytes)} color="rgb(244, 63, 94)" />
          </div>
        </Section>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-4 text-sm font-semibold tracking-wide text-slate-200">{title}</h2>
      {children}
    </div>
  );
}

function HealthCard({
  label, value, hint, color, trend,
}: {
  label: string; value: string; hint?: string; color?: string; trend?: number[];
}) {
  const accent = color === "emerald" ? "text-emerald-300" : color === "amber" ? "text-amber-300" : color === "rose" ? "text-rose-300" : "text-slate-100";
  const barColor = color === "emerald" ? "bg-emerald-500/20" : color === "amber" ? "bg-amber-500/20" : color === "rose" ? "bg-rose-500/20" : "bg-white/5";

  return (
    <div className="group rounded-[14px] border border-vault-border bg-vault-surface p-5 transition-all duration-[180ms] cubic-bezier(0.22,1,0.36,1) hover:border-vault-border/80 hover:shadow-sm hover:shadow-black/10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-widest text-vault-muted/70">
            {label}
          </div>
          <div className={`mt-1.5 text-2xl font-semibold tracking-tight ${accent}`}>
            {value}
          </div>
          {hint && <div className="mt-1 text-xs text-vault-muted/60">{hint}</div>}
        </div>
        {trend && trend.length > 1 && (
          <MiniChart data={trend} height={36} color={color === "emerald" ? "rgb(52,211,153)" : color === "amber" ? "rgb(251,191,36)" : "rgb(94,234,212)"} />
        )}
      </div>
      {/* Subtle bar */}
      {color && (
        <div className="mt-3 h-[2px] w-full overflow-hidden rounded-full bg-vault-bg">
          <div className={`h-full w-1/2 rounded-full ${barColor}`} />
        </div>
      )}
    </div>
  );
}

function ActionCard({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="group rounded-[14px] border border-amber-500/15 bg-amber-500/[0.03] p-4 transition-all duration-[180ms] cubic-bezier(0.22,1,0.36,1) hover:border-amber-500/25 hover:bg-amber-500/[0.06]">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-lg leading-none">{icon}</span>
        <span className="text-sm leading-relaxed text-slate-200">{children}</span>
      </div>
    </div>
  );
}

function InsightRow({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] bg-vault-surface/50 px-4 py-3 text-sm text-slate-200/80 transition-all duration-[120ms] hover:bg-vault-surface/80">
      <span className="text-base">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function TrendCard({ label, data, color }: { label: string; data: number[]; color: string }) {
  return (
    <div className="rounded-[14px] border border-vault-border bg-vault-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wider text-vault-muted/70">{label}</span>
        <MiniChart data={data} height={32} color={color} />
      </div>
    </div>
  );
}

function PageLoading() {
  return (
    <div className="flex h-full flex-col gap-6 p-8">
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  );
}

function PageError({ message }: { message: string }) {
  return (
    <EmptyState
      icon="⚠️"
      title="Connection Error"
      description={`Failed to reach the Rust core: ${message}`}
    />
  );
}
