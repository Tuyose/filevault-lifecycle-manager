import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ipc } from "../../lib/ipc";
import type { AppStatus, DatabaseStatus, DuplicateGroup, ScanRun, ScanStats, SchedulerStatus } from "../../types/ipc";
import { formatBytes } from "../../lib/folder-insights";
import {
  generateRecommendations,
  computeHealthScore,
  generateInsights,
  type Recommendation,
  type Insight,
  type Severity,
} from "../../lib/recommendations";
import { MiniChart } from "../../components/ui/MiniChart";
import { SkeletonCard } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";

type PageData = {
  app: AppStatus;
  db: DatabaseStatus;
  stats: ScanStats | null;
  groups: DuplicateGroup[];
  history: ScanRun[];
};

export function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [healthExpanded, setHealthExpanded] = useState(false);
  const [scheduler, setScheduler] = useState<SchedulerStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [app, db, stats, groups, history, sched] = await Promise.all([
          ipc.getAppStatus(),
          ipc.getDatabaseStatus(),
          ipc.getScanStats().catch(() => null),
          ipc.getDuplicateGroups().catch(() => [] as DuplicateGroup[]),
          ipc.getScanHistory().catch(() => [] as ScanRun[]),
          ipc.getSchedulerStatus().catch(() => null),
        ]);
        if (!cancelled) { setData({ app, db, stats: stats ?? null, groups: groups ?? [], history }); setScheduler(sched); }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const recs = useMemo(
    () => (data ? generateRecommendations(data.groups, data.history) : []),
    [data?.groups, data?.history],
  );
  const health = useMemo(
    () => (data ? computeHealthScore(data.groups, data.stats?.active ?? 0) : null),
    [data?.groups, data?.stats],
  );
  const insights = useMemo(
    () => (data ? generateInsights(data.groups, data.history) : []),
    [data?.groups, data?.history],
  );

  if (loading) return <PageLoading />;
  if (error) return <PageError message={error} />;
  if (!data) return null;

  const hasData = data.stats && data.stats.total > 0;

  return (
    <div className="flex h-full flex-col gap-8 overflow-y-auto p-8 animate-fade-in">
      {/* ── 1. Recommended Actions ── */}
      {recs.length > 0 && (
        <Section title="Recommended Actions" subtitle="Prioritised by impact">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {recs.slice(0, 6).map((rec, i) => (
              <RecCard
                key={rec.id}
                rec={rec}
                index={i}
                onClick={() => rec.navigateTo && navigate(rec.navigateTo)}
              />
            ))}
          </div>
        </Section>
      )}

      {!hasData && (
        <EmptyState
          icon="🔍"
          title="No data yet"
          description="Run your first scan from the Scanner tab to start tracking files and detecting duplicates."
          action={
            <button
              type="button"
              onClick={() => navigate("/scanner")}
              className="rounded-[10px] border border-vault-accent/40 bg-vault-accent/10 px-4 py-2 text-sm text-vault-accent transition-all duration-[120ms] hover:bg-vault-accent/20"
            >
              Go to Scanner
            </button>
          }
        />
      )}

      {/* ── 2. Health Overview ── */}
      {hasData && health && (
        <Section title="Health Overview">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {/* Health Score — expandable */}
            <button
              type="button"
              onClick={() => setHealthExpanded(!healthExpanded)}
              className="group relative rounded-[14px] border border-vault-border bg-vault-surface p-5 text-left transition-all duration-[180ms] hover:border-vault-border/80 hover:shadow-sm"
            >
              <div className="text-[11px] font-medium uppercase tracking-widest text-vault-muted/70">
                Health Score
              </div>
              <div className={`mt-1.5 text-3xl font-semibold tracking-tight ${
                health.score >= 80 ? "text-emerald-300" : health.score >= 50 ? "text-amber-300" : "text-rose-300"
              }`}>
                {health.score}<span className="text-lg text-vault-muted/40">/100</span>
              </div>

              {/* Expanded breakdown */}
              {healthExpanded && (
                <div className="mt-4 space-y-3 border-t border-vault-border/50 pt-4 animate-fade-in">
                  {health.breakdown.map((b) => (
                    <div key={b.label}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-vault-muted">{b.label}</span>
                        <span className={b.score >= 80 ? "text-emerald-300" : b.score >= 50 ? "text-amber-300" : "text-rose-300"}>
                          {b.score}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-vault-bg">
                        <div
                          className={`h-full rounded-full transition-all duration-[700ms] ${
                            b.score >= 80 ? "bg-emerald-500/50" : b.score >= 50 ? "bg-amber-500/50" : "bg-rose-500/50"
                          }`}
                          style={{ width: `${b.score}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="mt-2 text-[11px] text-vault-muted/50">Tap to close</div>
                </div>
              )}

              {!healthExpanded && (
                <div className="mt-2 text-xs text-vault-muted/50">Tap for breakdown</div>
              )}
            </button>

            <MetricCard label="Reclaimable Space" value={formatBytes(data.groups.reduce((s, g) => s + g.total_wasted_bytes, 0))} tone="amber" />
            <MetricCard label="Duplicate Groups" value={data.groups.length.toString()} />
            <MetricCard
              label="Files Tracked"
              value={(data.stats?.total ?? 0).toString()}
              subtitle={data.stats ? formatBytes(data.stats.total_bytes) : ""}
              trend={data.history.map((r) => r.total_seen)}
              />
              </div>

              {scheduler && (
              <div className="mt-2 flex items-center gap-3 text-xs text-vault-muted/60">
                <span className={`inline-block h-2 w-2 rounded-full ${scheduler.scanning ? "bg-amber-400 animate-pulse" : scheduler.idle ? "bg-emerald-400" : "bg-slate-400"}`} />
                <span>{scheduler.scanning ? "Auto-scan running" : scheduler.next_scan_label}</span>
              </div>
              )}
              </Section>
      )}

      {/* ── 3. Trends ── */}
      {data.history.length > 1 && (
        <Section title="Trends" subtitle="Last scans">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <TrendCard
              label="Files per scan"
              data={data.history.map((r) => r.total_seen)}
              color="rgb(94, 234, 212)"
            />
            <TrendCard
              label="Size per scan"
              data={data.history.map((r) => r.total_bytes)}
              color="rgb(251, 191, 36)"
            />
            <TrendCard
              label="Errors"
              data={data.history.map((r) => r.errors)}
              color="rgb(244, 63, 94)"
            />
          </div>
        </Section>
      )}

      {data.history.length <= 1 && hasData && (
        <Section title="Trends">
          <div className="rounded-[14px] border border-vault-border bg-vault-surface p-5 text-sm text-vault-muted">
            More scans needed to show trends. Run additional scans over time.
          </div>
        </Section>
      )}

      {/* ── 4. Insights Feed ── */}
      {insights.length > 0 && (
        <Section title="Insights">
          <div className="flex flex-col gap-2">
            {insights.map((insight, i) => (
              <InsightRow key={i} insight={insight} index={i} />
            ))}
          </div>
        </Section>
      )}

      {/* ── 5. Raw Stats (compact) ── */}
      {data.stats && (
        <Section title="Statistics">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <CompactStat label="Active" value={data.stats.active.toString()} />
            <CompactStat label="Archived" value={data.stats.archived.toString()} />
            <CompactStat label="Trashed" value={data.stats.trashed.toString()} />
            <CompactStat label="Deleted" value={data.stats.deleted.toString()} />
            <CompactStat label="Total size" value={formatBytes(data.stats.total_bytes)} />
          </div>
        </Section>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-slate-200">{title}</h2>
        {subtitle && <span className="text-xs text-vault-muted/50">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

/** Recommendation card with staggered entrance and hover lift. */
function RecCard({ rec, index, onClick }: { rec: Recommendation; index: number; onClick: () => void }) {
  const severityColors: Record<Severity, { border: string; bg: string; text: string }> = {
    high: { border: "border-rose-700/30", bg: "bg-rose-500/[0.04]", text: "text-rose-300" },
    medium: { border: "border-amber-600/25", bg: "bg-amber-500/[0.03]", text: "text-amber-300" },
    low: { border: "border-vault-border", bg: "bg-transparent", text: "text-vault-muted" },
  };
  const c = severityColors[rec.severity];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group cursor-pointer rounded-[14px] border p-5 text-left transition-all duration-[180ms] hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/10 ${c.border} ${c.bg}`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Severity dot + category */}
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${rec.severity === "high" ? "bg-rose-400" : rec.severity === "medium" ? "bg-amber-400" : "bg-slate-400"}`} />
        <span className="text-[11px] font-medium uppercase tracking-wider text-vault-muted/50">{rec.category}</span>
      </div>

      {/* Title */}
      <h3 className="mt-2 text-sm font-semibold leading-snug text-slate-100">{rec.title}</h3>

      {/* Description */}
      <p className="mt-1 text-xs leading-relaxed text-vault-muted/70">{rec.description}</p>

      {/* Metrics */}
      {(rec.reclaimableBytes !== undefined || rec.affectedFiles !== undefined) && (
        <div className="mt-3 flex items-center gap-3 text-xs">
          {rec.reclaimableBytes !== undefined && (
            <span className={`font-mono font-semibold ${c.text}`}>{formatBytes(rec.reclaimableBytes)}</span>
          )}
          {rec.affectedFiles !== undefined && (
            <span className="text-vault-muted/50">{rec.affectedFiles} files</span>
          )}
        </div>
      )}
    </button>
  );
}

/** Simple metric card. */
function MetricCard({
  label, value, subtitle, tone, trend,
}: {
  label: string; value: string; subtitle?: string; tone?: string; trend?: number[];
}) {
  const textColor = tone === "amber" ? "text-amber-300" : tone === "rose" ? "text-rose-300" : "text-slate-100";
  return (
    <div className="rounded-[14px] border border-vault-border bg-vault-surface p-5 transition-all duration-[180ms] hover:border-vault-border/80">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-widest text-vault-muted/70">{label}</div>
          <div className={`mt-1.5 text-2xl font-semibold tracking-tight ${textColor}`}>{value}</div>
          {subtitle && <div className="mt-1 text-xs text-vault-muted/60">{subtitle}</div>}
        </div>
        {trend && trend.length > 1 && <MiniChart data={trend} height={32} color="rgb(94,234,212)" />}
      </div>
    </div>
  );
}

/** Trend card with mini chart. */
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

/** Timestamped insight row with staggered entrance. */
function InsightRow({ insight, index }: { insight: Insight; index: number }) {
  const ago = Math.floor((Date.now() - insight.timestamp.getTime()) / (1000 * 60));
  const timeStr = ago < 1 ? "just now" : ago < 60 ? `${ago}m ago` : ago < 1440 ? `${Math.floor(ago / 60)}h ago` : `${Math.floor(ago / 1440)}d ago`;

  return (
    <div
      className="flex items-center gap-3 rounded-[10px] bg-vault-surface/40 px-4 py-3 text-sm text-slate-200/70 transition-all duration-[120ms] hover:bg-vault-surface/70 animate-fade-in"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <span className="text-base">{insight.icon}</span>
      <span className="flex-1">{insight.text}</span>
      <span className="shrink-0 text-[11px] text-vault-muted/40">{timeStr}</span>
    </div>
  );
}

function CompactStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-vault-border bg-vault-surface/40 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wider text-vault-muted/50">{label}</div>
      <div className="font-mono text-sm text-slate-200">{value}</div>
    </div>
  );
}

// ── Loading / Error states ───────────────────────────────────────

function PageLoading() {
  return (
    <div className="flex h-full flex-col gap-6 p-8">
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  );
}

function PageError({ message }: { message: string }) {
  return <EmptyState icon="⚠️" title="Connection Error" description={message} />;
}
