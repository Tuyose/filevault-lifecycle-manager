import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { listen } from "@tauri-apps/api/event";
import { FolderSearch, Play, Pause, Square, Clock, HardDrive, FileText } from "lucide-react";

import { dialogs, ipc } from "../../lib/ipc";
import type { DuplicateGroup, ScanProgress, ScanRun } from "../../types/ipc";
import { formatBytes, shortenPath, formatTime } from "../../lib/folder-insights";
import { PageShell } from "../../components/layout/PageShell";

type Phase = "idle" | "counting" | "scanning" | "paused" | "done" | "error";

// Extend WindowEventMap for typed location state
interface ScanIntent {
  source: string;
  watchFolderId?: string;
  path: string;
  autoStart?: boolean;
}

export function ScannerPage() {
  const location = useLocation();
  const intent = (location.state as { scanIntent?: ScanIntent })?.scanIntent;

  const [folder, setFolder] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [history, setHistory] = useState<ScanRun[]>([]);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [startTime] = useState(Date.now);
  const unlistenRef = useRef<(() => void) | null>(null);
  const intentConsumed = useRef(false);

  // Detect scan intent from navigation state (Watch Folder "Run now")
  useEffect(() => {
    if (intent && !intentConsumed.current) {
      intentConsumed.current = true;
      setFolder(intent.path);
      // Auto-start scan after a brief delay so UI mounts
      const t = setTimeout(() => startScan(intent.path), 100);
      return () => clearTimeout(t);
    }
  }, [intent]);

  useEffect(() => {
    ipc.getScanHistory().catch(() => []).then(setHistory);
    ipc.getDuplicateGroups().catch(() => []).then(setGroups);
  }, []);

  async function handlePick() {
    const picked = await dialogs.pickFolder();
    if (picked) setFolder(picked);
  }

  async function startScan(path: string) {
    if (!path) return;
    const unlisten = await listen<ScanProgress>("scan:progress", (e) => {
      const p = e.payload; setProgress(p);
      if (p.phase === "Counting") setPhase("counting");
      else if (p.phase === "Scanning") setPhase("scanning");
      else if (p.phase === "Done") setPhase("done");
    });
    unlistenRef.current?.();
    unlistenRef.current = unlisten;
    setPhase("counting"); setError(null); setProgress(null);
    try {
      await ipc.scanFolder(path);
      const [h, g] = await Promise.all([ipc.getScanHistory().catch(() => []), ipc.getDuplicateGroups().catch(() => [])]);
      setHistory(h); setGroups(g);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  const pct = progress && progress.total_files > 0
    ? Math.round((progress.processed / progress.total_files) * 100) : 0;
  const isRunning = phase === "counting" || phase === "scanning" || phase === "paused";
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const rate = elapsed > 0 && progress ? Math.round(progress.processed / elapsed) : 0;

  const latestRun = history.length > 0 ? history[0] : null;
  const wasted = groups.reduce((s, g) => s + g.total_wasted_bytes, 0);

  return (
    <PageShell title="Files" subtitle="Index folders and monitor scan progress"
      rightAction={intent?.source ? (
        <span className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: "rgba(99,102,241,0.12)", color: "#818CF8" }}>
          via {intent.source.replace("-", " ")}
        </span>
      ) : undefined}
    >
      <div className="flex flex-col gap-6">
        {/* Section 1: Command Center */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 }}
          className="overflow-hidden rounded-2xl" style={{ background: "linear-gradient(135deg, #0F0F20 0%, #0D0D1A 60%, #0A0A18 100%)", border: "1px solid rgba(99,102,241,0.15)", boxShadow: "0 0 60px rgba(99,102,241,0.04)" }}>
          <div className="p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <FolderSearch size={18} color="#818CF8" />
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#EDEDFD" }}>Scan Command Center</span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1 rounded-lg px-4 py-2.5 font-mono text-sm"
                    style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(100,100,220,0.12)", color: folder ? "#EDEDFD" : "#6060A0" }}>
                    {folder ?? "No folder selected"}
                  </div>
                  <button onClick={handlePick} disabled={isRunning}
                    className="cursor-pointer rounded-lg px-3 py-2.5 text-xs font-medium transition-all duration-150 disabled:opacity-40"
                    style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", color: "#818CF8" }}>
                    Select folder
                  </button>
                  {isRunning ? (
                    <div className="flex gap-1.5">
                      {phase === "paused" ? (
                        <button onClick={() => { ipc.resumeScan(); setPhase("scanning"); }}
                          className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-medium"
                          style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", color: "#10B981" }}>
                          <Play size={12} /> Resume
                        </button>
                      ) : (
                        <button onClick={() => { ipc.pauseScan(); setPhase("paused"); }}
                          className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-medium"
                          style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", color: "#F59E0B" }}>
                          <Pause size={12} /> Pause
                        </button>
                      )}
                      <button onClick={() => { ipc.cancelScan(); setPhase("idle"); }}
                        className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-medium"
                        style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#EF4444" }}>
                        <Square size={12} /> Stop
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => startScan(folder!)} disabled={!folder}
                      className="flex cursor-pointer items-center gap-1.5 rounded-lg px-4 py-2.5 text-xs font-medium transition-all duration-150 disabled:opacity-40"
                      style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)", color: "#A5B4FC" }}>
                      <Play size={12} /> Scan folder
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs" style={{ color: "#6060A0" }}>All processing is local — nothing leaves your machine.</p>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-lg px-4 py-2 text-sm" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#FCA5A5" }}>
                {error}
              </div>
            )}
          </div>
        </motion.div>

        {/* Section 2: Live Scan Performance */}
        {isRunning && progress && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-6" style={{ background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.1)" }}>
            {phase === "paused" && (
              <div className="mb-3 rounded-lg px-3 py-1.5 text-center text-xs font-semibold tracking-widest"
                style={{ background: "rgba(245,158,11,0.15)", color: "#F59E0B" }}>PAUSED</div>
            )}
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#EDEDFD", fontFamily: "var(--font-mono)" }}>
                  {progress.processed.toLocaleString()}<span style={{ fontSize: 16, color: "#6060A0" }}> / {progress.total_files.toLocaleString()}</span>
                </div>
                <div className="mt-1 text-xs" style={{ color: "#6060A0" }}>files processed</div>
              </div>
              <div className="text-right">
                <div style={{ fontSize: 18, fontWeight: 600, color: "#818CF8", fontFamily: "var(--font-mono)" }}>{pct}%</div>
                <div className="mt-1 text-xs" style={{ color: "#6060A0" }}>{rate} files/sec · {elapsed}s elapsed</div>
              </div>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
              <motion.div className="h-full rounded-full" style={{ background: "linear-gradient(90deg, #6366F1, #818CF8)" }}
                animate={{ width: `${pct}%` }} transition={{ duration: 0.3 }} />
            </div>
            {progress.current_path && (
              <div className="mt-3 space-y-0.5 overflow-hidden text-xs" style={{ color: "#6060A0" }}>
                <div className="truncate"><span style={{ color: "#818CF8" }}>file:</span> {progress.current_path}</div>
                <div className="truncate"><span style={{ color: "#818CF8" }}>dir: </span> {progress.current_dir}</div>
              </div>
            )}
          </motion.div>
        )}

        {/* Section 3: Last Scan Summary */}
        {latestRun && (
          <div>
            <h3 className="mb-3 text-sm font-semibold" style={{ color: "#EDEDFD" }}>Last Scan Summary</h3>
            <div className="grid grid-cols-3 gap-4 md:grid-cols-6">
              <MetricCard icon={FileText} label="Files indexed" value={latestRun.total_seen.toString()} color="#6366F1" />
              <MetricCard icon={HardDrive} label="Total size" value={formatBytes(latestRun.total_bytes)} color="#6366F1" />
              <MetricCard icon={FileText} label="Duplicate groups" value={groups.length.toString()} color="#EC4899" />
              <MetricCard icon={HardDrive} label="Reclaimable" value={formatBytes(wasted)} color="#F59E0B" />
              <MetricCard icon={Clock} label="Duration" value={`${Math.floor((new Date(latestRun.finished_at).getTime() - new Date(latestRun.started_at).getTime()) / 1000)}s`} color="#10B981" />
              <MetricCard icon={FileText} label="Errors" value={latestRun.errors.toString()} color={latestRun.errors > 0 ? "#EF4444" : "#6060A0"} />
            </div>
          </div>
        )}

        {/* Section 4: Folder Intelligence */}
        {groups.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-semibold" style={{ color: "#EDEDFD" }}>Folder Intelligence</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(100,100,220,0.08)" }}>
                <div className="text-xs" style={{ color: "#6060A0" }}>Duplicate groups</div>
                <div className="mt-1 text-lg font-semibold" style={{ color: "#EDEDFD", fontFamily: "var(--font-mono)" }}>{groups.length}</div>
                <div className="mt-1 text-xs" style={{ color: "#F59E0B" }}>{formatBytes(wasted)} reclaimable</div>
              </div>
              <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(100,100,220,0.08)" }}>
                <div className="text-xs" style={{ color: "#6060A0" }}>Most affected category</div>
                <div className="mt-1 text-lg font-semibold" style={{ color: "#EDEDFD" }}>
                  {groups.length > 0 ? (groups[0].files[0]?.path.split(".").pop()?.toUpperCase() ?? "—") : "—"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section 5: Recent Scans */}
        {history.length > 1 && (
          <div>
            <h3 className="mb-3 text-sm font-semibold" style={{ color: "#EDEDFD" }}>Recent Scans</h3>
            <div className="flex flex-col gap-1">
              {history.slice(0, 5).map((run) => (
                <div key={run.id} className="flex items-center gap-4 rounded-lg px-4 py-2.5"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(100,100,220,0.06)" }}>
                  <span className="shrink-0 text-xs" style={{ color: "#6060A0" }}>{formatTime(run.finished_at)}</span>
                  <span className="min-w-0 truncate font-mono text-xs" title={run.root_path} style={{ color: "#8080B0" }}>{shortenPath(run.root_path, 2)}</span>
                  <span className="shrink-0 font-mono text-xs" style={{ color: "#EDEDFD" }}>{run.total_seen.toLocaleString()} files</span>
                  <span className="shrink-0 font-mono text-xs" style={{ color: "#6060A0" }}>
                    {Math.floor((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)}s
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}

function MetricCard({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ size?: number; color?: string }>; label: string; value: string; color: string;
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)", border: "1px solid rgba(100,100,220,0.1)" }}>
      <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: `${color}18` }}>
        <Icon size={13} color={color} />
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#EDEDFD", fontFamily: "var(--font-mono)", marginTop: 8 }}>{value}</div>
      <div className="text-xs" style={{ color: "#6060A0", marginTop: 2 }}>{label}</div>
    </div>
  );
}
