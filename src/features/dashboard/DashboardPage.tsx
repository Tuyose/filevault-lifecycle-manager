import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  Clock,
  Copy,
  HardDrive,
  Info,
  Scan,
  TrendingUp,
  Zap,
} from "lucide-react";

import { ipc } from "../../lib/ipc";
import type { AnalyticsSnapshot, DuplicateGroup, ScanRun, ScanStats, SchedulerStatus } from "../../types/ipc";
import { formatBytes } from "../../lib/folder-insights";
import { generateRecommendations, generateInsights } from "../../lib/recommendations";

// ── Hooks ───────────────────────────────────────────────────────

function useCountUp(target: number, delay = 400, duration = 1000) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      const start = performance.now();
      const fn = (now: number) => {
        const p = Math.min((now - start) / duration, 1);
        setValue(Math.round((1 - Math.pow(1 - p, 3)) * target));
        if (p < 1) requestAnimationFrame(fn);
      };
      requestAnimationFrame(fn);
    }, delay);
    return () => clearTimeout(timer);
  }, [target, delay, duration]);
  return value;
}

// ── SVG Health Arc ──────────────────────────────────────────────

function HealthArc({ score }: { score: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      const start = performance.now();
      const fn = (now: number) => {
        const p = Math.min((now - start) / 1200, 1);
        setV(Math.round((1 - Math.pow(1 - p, 3)) * score));
        if (p < 1) requestAnimationFrame(fn);
      };
      requestAnimationFrame(fn);
    }, 200);
    return () => clearTimeout(t);
  }, [score]);

  const r = 72, cx = 90, cy = 95;
  const circ = 2 * Math.PI * r;
  const vis = (270 / 360) * circ;
  const fill = (v / 100) * vis;
  const color = score >= 80 ? "#10B981" : score >= 60 ? "#F59E0B" : "#EF4444";
  const ticks = [0, 50, 100];

  return (
    <div className="relative flex items-center justify-center" style={{ width: 180, height: 170 }}>
      <svg width="180" height="170" viewBox="0 0 180 180" style={{ position: "absolute", top: 0, left: 0 }}>
        <defs><filter id="g"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${vis} ${circ - vis}`} transform={`rotate(-225 ${cx} ${cy})`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${fill} ${circ - fill}`} transform={`rotate(-225 ${cx} ${cy})`} filter="url(#g)" style={{ transition: "stroke-dasharray 0.05s" }} />
        {ticks.map((pct) => {
          const a = (-225 + (pct / 100) * 270) * (Math.PI / 180);
          return <line key={pct} x1={cx + (r - 14) * Math.cos(a)} y1={cy + (r - 14) * Math.sin(a)}
            x2={cx + (r - 9) * Math.cos(a)} y2={cy + (r - 9) * Math.sin(a)}
            stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" />;
        })}
      </svg>
      <div className="flex flex-col items-center" style={{ marginTop: 8 }}>
        <span style={{ fontSize: 48, fontWeight: 700, color, lineHeight: 1, fontFamily: "var(--font-mono)", letterSpacing: -2, textShadow: `0 0 30px ${color}60` }}>{v}</span>
        <span style={{ fontSize: 11, color: "#6060A0", fontWeight: 500, marginTop: 2 }}>/ 100</span>
      </div>
    </div>
  );
}

// ── Stat Card ───────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color, delay }: {
  icon: React.ComponentType<{ size?: number; color?: string }>; label: string; value: string;
  sub?: string; color: string; delay: number;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay }}
      className="flex flex-col gap-2 rounded-xl p-4" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)", border: "1px solid rgba(100,100,220,0.1)" }}>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${color}18` }}>
        <Icon size={15} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#EDEDFD", fontFamily: "var(--font-mono)", letterSpacing: "-0.5px" }}>{value}</div>
        <div style={{ fontSize: 12, color: "#6060A0", fontWeight: 400 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color, fontWeight: 500, marginTop: 2 }}>{sub}</div>}
      </div>
    </motion.div>
  );
}

function Metric({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ size?: number; color?: string }>; label: string; value: string; color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: `${color}18` }}>
        <Icon size={13} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#EDEDFD", fontFamily: "var(--font-mono)" }}>{value}</div>
        <div style={{ fontSize: 11, color: "#6060A0" }}>{label}</div>
      </div>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────

export function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [scheduler, setScheduler] = useState<SchedulerStatus | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSnapshot[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [app, db, stats, groups, history, sched, an] = await Promise.all([
          ipc.getAppStatus(),
          ipc.getDatabaseStatus(),
          ipc.getScanStats().catch(() => null),
          ipc.getDuplicateGroups().catch(() => [] as DuplicateGroup[]),
          ipc.getScanHistory().catch(() => [] as ScanRun[]),
          ipc.getSchedulerStatus().catch(() => null),
          ipc.getDashboardAnalytics().catch(() => [] as AnalyticsSnapshot[]),
        ]);
        if (!cancelled) { setData({ app, db, stats, groups: groups ?? [], history }); setScheduler(sched); setAnalytics(an ?? []); }
      } catch { /* ignore */ } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const groups: DuplicateGroup[] = data?.groups ?? [];
  const stats: ScanStats | null = data?.stats ?? null;
  const history: ScanRun[] = data?.history ?? [];
  const hasData = stats && stats.total > 0;
  const wasted = groups.reduce((s: number, g: DuplicateGroup) => s + g.total_wasted_bytes, 0);
  const healthScore = analytics.length > 0 ? analytics[analytics.length - 1].health_score : (hasData ? 82 : 0);
  const healthColor = healthScore >= 80 ? "#10B981" : healthScore >= 60 ? "#F59E0B" : "#EF4444";
  const healthLabel = healthScore >= 80 ? "Healthy" : healthScore >= 60 ? "Fair" : "Critical";
  const recs = useMemo(() => generateRecommendations(groups, history), [groups, history]);
  const insights = useMemo(() => generateInsights(groups, history), [groups, history]);
  const topRec = recs.length > 0 ? recs[0] : null;
  const filesTracked = useCountUp(stats?.total ?? 0, 600, 1000);
  const dupGroupCount = groups.length;

  // Build intelligence feed
  const feed = [
    ...(scheduler?.next_scan_label && scheduler.next_scan_label !== "No upcoming scans"
      ? [{ id: "sched", type: "info" as const, title: "Scheduled scans active", desc: scheduler.next_scan_label, time: "now" }] : []),
    ...(scheduler?.scanning
      ? [{ id: "scanning", type: "info" as const, title: "Auto-scan running", desc: "A scheduled scan is in progress", time: "now" }] : []),
    ...recs.slice(0, 3).map((r) => ({
      id: r.id, type: (r.severity === "high" ? "warning" : "info") as "warning" | "info",
      title: r.title, desc: r.description, time: "now", route: r.navigateTo,
    })),
    ...(insights.length > 0 ? [{
      id: "ins-0", type: "info" as const, title: insights[0].text,
      desc: `${Math.floor((Date.now() - insights[0].timestamp.getTime()) / 60000)}m ago`, time: "now",
    }] : []),
  ];

  if (loading) return <div className="flex h-full items-center justify-center" style={{ color: "#6060A0" }}>Loading...</div>;

  return (
    <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
      <style>{`div::-webkit-scrollbar { display: none; }`}</style>
      <div className="mx-auto max-w-5xl px-8 py-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
          className="mb-8 flex items-center justify-between">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: "#EDEDFD", margin: 0 }}>Overview</h1>
            <p style={{ fontSize: 13, color: "#6060A0", margin: "2px 0 0" }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
          <button onClick={() => navigate("/scanner")}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-150"
            style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#818CF8" }}>
            <Scan size={14} /> Scan Now
          </button>
        </motion.div>

        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}
          className="mb-6 overflow-hidden rounded-2xl"
          style={{ background: "linear-gradient(135deg, #0F0F20 0%, #0D0D1A 60%, #0A0A18 100%)",
            border: "1px solid rgba(99,102,241,0.15)", boxShadow: "0 0 60px rgba(99,102,241,0.06)" }}>
          <div className="flex items-stretch">
            <div className="flex flex-col items-center justify-center px-8 py-8" style={{ borderRight: "1px solid rgba(100,100,220,0.08)", minWidth: 220 }}>
              {hasData ? (
                <><HealthArc score={healthScore} />
                  <div className="mt-1 text-center">
                    <div style={{ fontSize: 15, fontWeight: 600, color: healthColor, marginBottom: 2 }}>{healthLabel}</div>
                    <div style={{ fontSize: 12, color: "#6060A0" }}>File System Health</div>
                  </div></>
              ) : (
                <div className="flex flex-col items-center gap-4 py-8 text-center" style={{ color: "#6060A0" }}>
                  <Scan size={32} style={{ opacity: 0.3 }} />
                  <p style={{ fontSize: 13 }}>Run your first scan to see health data.</p>
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col justify-center px-8 py-8">
              {hasData ? (
                <><div style={{ fontSize: 28, fontWeight: 700, color: "#EDEDFD", lineHeight: 1.2 }}>
                    Your system is <span style={{ color: healthColor }}>{healthLabel.toLowerCase()}</span>.
                  </div>
                  <div style={{ fontSize: 14, color: "#8080B0", marginTop: 8, lineHeight: 1.6 }}>
                    {recs.length} action{recs.length !== 1 ? "s" : ""} need{recs.length === 1 ? "s" : ""} your attention.
                  </div>
                  <div className="mt-6 flex gap-6">
                    <Metric icon={HardDrive} label="Reclaimable" value={formatBytes(wasted)} color="#F59E0B" />
                    <Metric icon={Clock} label="Next Scan" value={scheduler?.next_scan_label ?? "—"} color="#6366F1" />
                    <Metric icon={Copy} label="Duplicates" value={`${dupGroupCount} groups`} color="#EC4899" />
                  </div>
                  {topRec && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
                      className="mt-6 flex items-center justify-between rounded-xl px-4 py-3"
                      style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.18)" }}>
                      <div className="flex items-center gap-3">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "rgba(99,102,241,0.2)" }}>
                          <Zap size={13} color="#818CF8" />
                        </div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#EDEDFD" }}>Recommended Action</div>
                          <div style={{ fontSize: 12, color: "#8080B8" }}>{topRec.title}</div>
                        </div>
                      </div>
                      {topRec.navigateTo && (
                        <button onClick={() => navigate(topRec.navigateTo!)}
                          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
                          style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)", color: "#818CF8" }}>
                          Go to Cleanup <ArrowUpRight size={11} />
                        </button>
                      )}
                    </motion.div>
                  )}</>
              ) : (
                <div className="flex flex-col gap-4" style={{ color: "#6060A0", fontSize: 14 }}>
                  <p>Welcome to FileVault. Start by scanning a folder to analyse your files.</p>
                  <button onClick={() => navigate("/scanner")}
                    className="flex w-fit cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all"
                    style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#818CF8" }}>
                    <Scan size={14} /> Start Scan
                  </button>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Stat cards */}
        {hasData && (
          <div className="mb-8 grid grid-cols-4 gap-4">
            <StatCard icon={HardDrive} label="Files Tracked" value={filesTracked.toLocaleString()} sub={`${stats?.active ?? 0} active`} color="#6366F1" delay={0.1} />
            <StatCard icon={Copy} label="Duplicate Groups" value={dupGroupCount.toString()} sub={`${formatBytes(wasted)} wasted`} color="#EC4899" delay={0.15} />
            <StatCard icon={TrendingUp} label="Health Score" value={healthScore.toString()} sub={healthLabel} color="#10B981" delay={0.2} />
            <StatCard icon={HardDrive} label="Reclaimable" value={formatBytes(wasted)} sub="across all duplicates" color="#F59E0B" delay={0.25} />
          </div>
        )}

        {/* Feed */}
        {feed.length > 0 && (
          <div>
            <div className="mb-4 flex items-center gap-2">
              <h2 style={{ fontSize: 15, fontWeight: 600, color: "#EDEDFD", margin: 0 }}>Intelligence Feed</h2>
              <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "rgba(99,102,241,0.12)", color: "#818CF8" }}>{feed.length} events</span>
            </div>
            <div className="flex flex-col gap-1">
              {feed.map((ev, i) => {
                const iconColor = ev.type === "warning" ? "#F59E0B" : "#6366F1";
                const bgColor = ev.type === "warning" ? "rgba(245,158,11,0.1)" : "rgba(99,102,241,0.1)";
                const Icon = ev.type === "warning" ? AlertTriangle : Info;
                return (
                  <motion.div key={ev.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                    className="flex items-start gap-3 rounded-lg px-4 py-3" style={{ background: bgColor }}>
                    <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-md" style={{ background: `${iconColor}18` }}>
                      <Icon size={12} color={iconColor} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#EDEDFD" }}>{ev.title}</div>
                      <div style={{ fontSize: 12, color: "#8080B0", marginTop: 1 }}>{ev.desc}</div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
