import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Clock, AlertTriangle, Activity } from "lucide-react";
import { ipc } from "../../lib/ipc";
import type { ScanRun } from "../../types/ipc";
import { formatBytes, shortenPath, formatTime } from "../../lib/folder-insights";
import { PageShell } from "../../components/layout/PageShell";

const eventIcons: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  completed: Activity,
  cancelled: AlertTriangle,
  error: AlertTriangle,
};

const eventColors: Record<string, string> = {
  completed: "#10B981",
  cancelled: "#F59E0B",
  error: "#EF4444",
};

export function HistoryPage() {
  const [history, setHistory] = useState<ScanRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ipc.getScanHistory().then((h) => setHistory(h)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <PageShell title="History" subtitle="Timeline of scans and system events">
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }} />
          ))}
        </div>
      </PageShell>
    );
  }

  if (history.length === 0) {
    return (
      <PageShell title="History" subtitle="Timeline of scans and system events">
        <div className="flex flex-col items-center gap-6 py-16 text-center"
          style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.04) 0%, rgba(16,185,129,0.02) 100%)", border: "1px solid rgba(100,100,220,0.1)", borderRadius: 16 }}>
          <Clock size={40} style={{ color: "#6060A0", opacity: 0.4 }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#EDEDFD" }}>No scan history yet</div>
            <div className="mt-1" style={{ fontSize: 13, color: "#6060A0" }}>
              Scan history will appear here after your first scan.
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="History" subtitle="Timeline of scans and system events">
      <div className="flex flex-col gap-2">
        {history.map((run, i) => {
          const status = run.status || "completed";
          const color = eventColors[status] ?? "#818CF8";
          const Icon = eventIcons[status] ?? Activity;
          const duration = `${Math.floor((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)}s`;
          return (
            <motion.div key={run.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
              className="flex items-start gap-4 rounded-xl px-5 py-4 transition-all duration-150"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(100,100,220,0.06)" }}>
              {/* Timeline icon */}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}18` }}>
                <Icon size={15} color={color} />
              </div>
              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#EDEDFD" }}>
                    {status === "completed" ? "Scan completed" : status === "cancelled" ? "Scan cancelled" : "Scan failed"}
                  </span>
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: `${color}18`, color }}>
                    {run.total_seen.toLocaleString()} files
                  </span>
                </div>
                <div className="mt-1 font-mono text-xs truncate" style={{ color: "#6060A0" }} title={run.root_path}>
                  {shortenPath(run.root_path, 3)}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs" style={{ color: "#6060A0" }}>
                  <span>{formatBytes(run.total_bytes)}</span>
                  <span>{duration}</span>
                  {run.errors > 0 && <span style={{ color: "#EF4444" }}>{run.errors} errors</span>}
                </div>
              </div>
              {/* Time */}
              <div className="shrink-0 text-right text-xs" style={{ color: "#6060A0" }}>
                {formatTime(run.finished_at)}
              </div>
            </motion.div>
          );
        })}
      </div>
    </PageShell>
  );
}
