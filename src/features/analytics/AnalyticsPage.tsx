import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { BarChart3, TrendingUp, TrendingDown, Activity, HardDrive, Copy } from "lucide-react";

import { ipc } from "../../lib/ipc";
import type { AnalyticsSnapshot } from "../../types/ipc";
import { formatBytes } from "../../lib/folder-insights";
import { MiniChart } from "../../components/ui/MiniChart";
import { PageShell } from "../../components/layout/PageShell";

export function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ipc.getDashboardAnalytics().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <PageShell title="Analytics" subtitle="Track file health over time">
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }} />
          ))}
        </div>
      </PageShell>
    );
  }

  if (data.length < 2) {
    return (
      <PageShell title="Analytics" subtitle="Track file health over time">
        <div className="flex flex-col items-center gap-6 py-16 text-center"
          style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.04) 0%, rgba(16,185,129,0.02) 100%)", border: "1px solid rgba(100,100,220,0.1)", borderRadius: 16 }}>
          <BarChart3 size={40} style={{ color: "#6060A0", opacity: 0.4 }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#EDEDFD" }}>Not enough data yet</div>
            <div className="mt-1" style={{ fontSize: 13, color: "#6060A0", maxWidth: 360 }}>
              Run more scans to unlock historical analytics and trend charts.
            </div>
          </div>
          {/* Simulated blurred chart preview */}
          <div className="flex gap-4 opacity-20 blur-sm">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="w-3 rounded-t" style={{ height: 20 + Math.random() * 60, background: "#818CF8" }} />
            ))}
          </div>
        </div>
      </PageShell>
    );
  }

  const latest = data[data.length - 1];
  const first = data[0];
  const healthDelta = latest.health_score - first.health_score;
  const sizeDelta = latest.total_size_bytes - first.total_size_bytes;
  const dupDelta = latest.duplicate_groups - first.duplicate_groups;

  return (
    <PageShell title="Analytics" subtitle="Track file health over time">
      <div className="flex flex-col gap-6">
        {/* Hero */}
        <div className="grid grid-cols-4 gap-4">
          <DeltaCard label="Health Score" value={`${latest.health_score}/100`} delta={`${healthDelta >= 0 ? "+" : ""}${healthDelta} pts`}
            positive={healthDelta >= 0} color={healthDelta >= 0 ? "#10B981" : "#EF4444"} icon={healthDelta >= 0 ? TrendingUp : TrendingDown} />
          <DeltaCard label="Total Storage" value={formatBytes(latest.total_size_bytes)} delta={`${sizeDelta >= 0 ? "+" : ""}${formatBytes(Math.abs(sizeDelta))}`}
            positive={sizeDelta < 0} color={sizeDelta < 0 ? "#10B981" : "#F59E0B"} icon={HardDrive} />
          <DeltaCard label="Duplicate Groups" value={latest.duplicate_groups.toString()} delta={`${dupDelta >= 0 ? "+" : ""}${dupDelta}`}
            positive={dupDelta < 0} color={dupDelta < 0 ? "#10B981" : "#F59E0B"} icon={Copy} />
          <DeltaCard label="Reclaimable" value={formatBytes(latest.reclaimable_bytes)} delta="tracked" positive={true} color="#818CF8" icon={Activity} />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-2 gap-4">
          <ChartCard label="Health Score" data={data.map((d) => d.health_score)} color="#10B981" formatter={(v) => `${v}/100`} />
          <ChartCard label="Reclaimable Space" data={data.map((d) => d.reclaimable_bytes)} color="#F59E0B" formatter={(v) => formatBytes(v)} />
          <ChartCard label="Tracked Files" data={data.map((d) => d.tracked_files)} color="#818CF8" formatter={(v) => v.toLocaleString()} />
          <ChartCard label="Duplicate Groups" data={data.map((d) => d.duplicate_groups)} color="#EC4899" formatter={(v) => v.toString()} />
        </div>
      </div>
    </PageShell>
  );
}

function DeltaCard({ icon: Icon, label, value, delta, positive, color }: {
  icon: React.ComponentType<{ size?: number; color?: string }>; label: string; value: string; delta: string; positive: boolean; color: string;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-xl p-5" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)", border: "1px solid rgba(100,100,220,0.1)" }}>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${color}18` }}>
        <Icon size={15} color={color} />
      </div>
      <div className="mt-3" style={{ fontSize: 20, fontWeight: 700, color: "#EDEDFD", fontFamily: "var(--font-mono)" }}>{value}</div>
      <div className="mt-0.5 text-xs" style={{ color: "#6060A0" }}>{label}</div>
      <div className="mt-1.5 text-xs font-medium" style={{ color: positive ? "#10B981" : "#EF4444" }}>{delta}</div>
    </motion.div>
  );
}

function ChartCard({ label, data, color, formatter }: {
  label: string; data: number[]; color: string; formatter: (v: number) => string;
}) {
  const current = data[data.length - 1] ?? 0;
  return (
    <div className="rounded-xl p-5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(100,100,220,0.08)" }}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs" style={{ color: "#6060A0" }}>{label}</div>
          <div className="mt-1 text-lg font-semibold" style={{ color: "#EDEDFD", fontFamily: "var(--font-mono)" }}>{formatter(current)}</div>
        </div>
        <MiniChart data={data} height={36} color={color} />
      </div>
    </div>
  );
}
