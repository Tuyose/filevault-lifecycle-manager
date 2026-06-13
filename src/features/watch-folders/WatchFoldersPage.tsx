import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Eye, Plus, Download, Monitor, FileText, Clock, CheckCircle2, AlertTriangle, Pause, Play } from "lucide-react";

import { dialogs, ipc } from "../../lib/ipc";
import type { WatchFolder } from "../../types/ipc";
import { formatTime } from "../../lib/folder-insights";
import { PageShell } from "../../components/layout/PageShell";

const DEFAULT_SUGGESTIONS = [
  { label: "Downloads", path: "%USERPROFILE%\\Downloads", icon: Download },
  { label: "Desktop", path: "%USERPROFILE%\\Desktop", icon: Monitor },
  { label: "Documents", path: "%USERPROFILE%\\Documents", icon: FileText },
];

const FREQ_LABELS: Record<string, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };

export function WatchFoldersPage() {
  const navigate = useNavigate();
  const [folders, setFolders] = useState<WatchFolder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    ipc.listWatchFolders().then(setFolders).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  async function handleAdd(path: string, label: string) {
    await ipc.addWatchFolder({ path, label, frequency: "weekly", preferredWeekday: 6, preferredHour: 20, preferredMinute: 0 });
    load();
  }

  async function handleToggle(id: string, enabled: boolean) { await ipc.toggleWatchFolder(id, enabled); load(); }
  async function handleDelete(id: string) { await ipc.deleteWatchFolder(id); load(); }

  async function handleRunNow(wf: WatchFolder) {
    navigate("/scanner", { state: { scanIntent: { source: "watch-folder", watchFolderId: wf.id, path: wf.path, autoStart: true } } });
    ipc.runWatchFolderScan(wf.id).catch(() => {});
    load();
  }

  async function handlePickAdd() {
    const picked = await dialogs.pickFolder();
    if (!picked) return;
    const name = picked.split(/[/\\]/).pop() || "Folder";
    await handleAdd(picked, name);
  }

  const active = folders.filter((f) => f.enabled).length;
  const overdue = folders.filter((f) => f.enabled && f.next_scan_at && new Date(f.next_scan_at) < new Date()).length;
  const nextScan = folders.filter((f) => f.enabled && f.next_scan_at).sort((a, b) => new Date(a.next_scan_at!).getTime() - new Date(b.next_scan_at!).getTime())[0];

  return (
    <PageShell title="Watch Folders" subtitle="Automatically scan folders on a schedule">
      <div className="flex flex-col gap-6">
        {/* Hero */}
        <div className="grid grid-cols-4 gap-4">
          <MiniStat label="Active" value={active.toString()} color="#10B981" icon={CheckCircle2} />
          <MiniStat label="Overdue" value={overdue.toString()} color={overdue > 0 ? "#EF4444" : "#10B981"} icon={AlertTriangle} />
          <MiniStat label="Next Scan" value={nextScan ? formatTime(nextScan.next_scan_at!) : "—"} color="#818CF8" icon={Clock} />
          <MiniStat label="Total" value={folders.length.toString()} color="#6060A0" icon={Eye} />
        </div>

        {/* Folder list */}
        {loading ? <div className="text-center text-sm" style={{ color: "#6060A0" }}>Loading...</div> :
         folders.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl p-12 text-center"
            style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.04) 0%, rgba(16,185,129,0.02) 100%)", border: "1px solid rgba(100,100,220,0.1)" }}>
            <Eye size={32} style={{ color: "#6060A0", opacity: 0.3 }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#EDEDFD" }}>Automate your storage health</div>
              <div className="mt-1" style={{ fontSize: 13, color: "#6060A0", maxWidth: 360 }}>
                Add Downloads, Desktop, or Documents to scan them on a schedule.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_SUGGESTIONS.map((s) => (
                <button key={s.label} onClick={() => handleAdd(s.path, s.label)}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
                  style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)", color: "#818CF8" }}>
                  <s.icon size={12} /> {s.label}
                </button>
              ))}
              <button onClick={handlePickAdd}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
                style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#A5B4FC" }}>
                <Plus size={12} /> Choose Folder
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {folders.map((wf, i) => {
              const healthy = wf.enabled && wf.last_scan_at && (Date.now() - new Date(wf.last_scan_at).getTime()) < 7 * 86400000;
              const statusColor = !wf.enabled ? "#6060A0" : healthy ? "#10B981" : "#F59E0B";
              const statusLabel = !wf.enabled ? "Paused" : healthy ? "Healthy" : "Attention";
              return (
                <motion.div key={wf.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  className="rounded-xl p-5 transition-all duration-150 hover:border-opacity-50"
                  style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 100%)", border: "1px solid rgba(100,100,220,0.08)" }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: 15, fontWeight: 600, color: "#EDEDFD" }}>{wf.label}</span>
                        <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: `${statusColor}18`, color: statusColor }}>{statusLabel}</span>
                      </div>
                      <div className="mt-1 font-mono text-xs truncate" style={{ color: "#6060A0" }} title={wf.path}>{wf.path}</div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "#6060A0" }}>
                        <span>{FREQ_LABELS[wf.frequency] ?? wf.frequency}</span>
                        {wf.last_scan_at && <span>Last: {formatTime(wf.last_scan_at)}</span>}
                        {wf.next_scan_at && <span>Next: {formatTime(wf.next_scan_at)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => handleToggle(wf.id, !wf.enabled)}
                        className="cursor-pointer rounded-lg px-2.5 py-2 text-xs transition-all"
                        style={{ background: wf.enabled ? "rgba(245,158,11,0.12)" : "rgba(16,185,129,0.12)", color: wf.enabled ? "#F59E0B" : "#10B981" }}>
                        {wf.enabled ? <Pause size={13} /> : <Play size={13} />}
                      </button>
                      <button onClick={() => handleRunNow(wf)}
                        className="cursor-pointer rounded-lg px-3 py-2 text-xs font-medium transition-all"
                        style={{ background: "rgba(99,102,241,0.12)", color: "#818CF8" }}>
                        Run now
                      </button>
                      <button onClick={() => handleDelete(wf.id)}
                        className="cursor-pointer rounded-lg px-2.5 py-2 text-xs transition-all"
                        style={{ background: "rgba(239,68,68,0.08)", color: "#F87171" }}>
                        Remove
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
            <button onClick={handlePickAdd}
              className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-lg py-3 text-xs font-medium transition-all"
              style={{ background: "rgba(99,102,241,0.06)", border: "1px dashed rgba(99,102,241,0.15)", color: "#818CF8" }}>
              <Plus size={13} /> Add Watch Folder
            </button>
          </div>
        )}
      </div>
    </PageShell>
  );
}

function MiniStat({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ size?: number; color?: string }>; label: string; value: string; color: string;
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)", border: "1px solid rgba(100,100,220,0.1)" }}>
      <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: `${color}18` }}>
        <Icon size={13} color={color} />
      </div>
      <div className="mt-3" style={{ fontSize: 18, fontWeight: 700, color: "#EDEDFD", fontFamily: "var(--font-mono)" }}>{value}</div>
      <div className="mt-0.5 text-xs" style={{ color: "#6060A0" }}>{label}</div>
    </div>
  );
}
