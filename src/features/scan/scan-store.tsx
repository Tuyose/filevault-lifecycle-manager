import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { useNavigate } from "react-router-dom";
import { Pause, Play, Square, Activity } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ipc } from "../../lib/ipc";
import type { ScanJob, ScanProgress } from "../../types/ipc";

export type ScanJobContextType = {
  job: ScanJob | null;
  progress: ScanProgress | null;
  isActive: boolean;
  startScan: (path: string, source: "manual" | "watch-folder", watchFolderId?: string) => Promise<void>;
  pauseScan: () => Promise<void>;
  resumeScan: () => Promise<void>;
  cancelScan: () => Promise<void>;
  clearCompleted: () => void;
};

const ScanJobContext = createContext<ScanJobContextType>({
  job: null, progress: null, isActive: false,
  startScan: async () => {}, pauseScan: async () => {}, resumeScan: async () => {},
  cancelScan: async () => {}, clearCompleted: () => {},
});

export const useScanJob = () => useContext(ScanJobContext);

export function ScanJobProvider({ children }: { children: ReactNode }) {
  const [job, setJob] = useState<ScanJob | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(false);

  const isActive = job?.status === "counting" || job?.status === "scanning" || job?.status === "paused";

  // Poll for active scan job on mount
  const pollJob = useCallback(async () => {
    const j = await ipc.getActiveScanJob().catch(() => null);
    if (j && (j.status === "counting" || j.status === "scanning" || j.status === "paused")) {
      setJob(j);
      return true;
    }
    if (j) setJob(j);
    return false;
  }, []);

  useEffect(() => {
    pollJob();
    pollRef.current = setInterval(() => {
      pollJob().then((active) => {
        if (!active && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      });
    }, 1000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [pollJob]);

  // Single progress listener
  useEffect(() => {
    (async () => {
      const ul = await listen<ScanProgress>("scan:progress", (e) => {
        setProgress(e.payload);
        setJob((prev) => prev ? { ...prev,
          processed: e.payload.processed,
          total_files: e.payload.total_files,
          current_path: e.payload.current_path,
          current_dir: e.payload.current_dir,
        } : prev);
      });
      unlistenRef.current = ul;
    })();
    return () => { unlistenRef.current?.(); };
  }, []);

  const startScan = useCallback(async (path: string, source: "manual" | "watch-folder", watchFolderId?: string) => {
    if (startedRef.current) return;
    if (isActive) return;
    startedRef.current = true;
    try {
      const j = await ipc.startScanJob({ path, source, watch_folder_id: watchFolderId });
      setJob(j);
      setProgress(null);
      // Start polling again
      pollRef.current = setInterval(() => {
        pollJob().then((active) => { if (!active && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } });
      }, 1000);
    } catch (err) { console.error("startScan failed:", err); }
    finally { startedRef.current = false; }
  }, [isActive, pollJob]);

  const pauseScan = useCallback(async () => { await ipc.pauseScan(); }, []);
  const resumeScan = useCallback(async () => { await ipc.resumeScan(); }, []);
  const cancelScan = useCallback(async () => {
    await ipc.cancelScan();
    setJob((prev) => prev ? { ...prev, status: "cancelled" } : null);
  }, []);
  const clearCompleted = useCallback(() => { setJob(null); setProgress(null); }, []);

  return (
    <ScanJobContext.Provider value={{ job, progress, isActive, startScan, pauseScan, resumeScan, cancelScan, clearCompleted }}>
      {children}
    </ScanJobContext.Provider>
  );
}

// ── Global Activity Bar ──────────────────────────────────────────

export function GlobalActivityBar() {
  const { job, progress, isActive, pauseScan, resumeScan, cancelScan, clearCompleted } = useScanJob();
  const navigate = useNavigate();

  const pct = progress && progress.total_files > 0
    ? Math.min(100, Math.round((progress.processed / progress.total_files) * 100)) : 0;

  // Show for 10s after completion, then auto-hide
  const [showCompleted, setShowCompleted] = useState(false);
  useEffect(() => {
    if (job?.status === "completed") {
      setShowCompleted(true);
      const t = setTimeout(() => { setShowCompleted(false); clearCompleted(); }, 10000);
      return () => clearTimeout(t);
    }
  }, [job?.status, job?.id]);

  if (!isActive && !showCompleted) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed bottom-0 left-60 right-0 z-50"
        style={{ background: "rgba(13,13,26,0.95)", borderTop: "1px solid rgba(99,102,241,0.15)", backdropFilter: "blur(12px)" }}
      >
        {/* Thin progress line */}
        {isActive && (
          <div className="h-0.5 w-full" style={{ background: "rgba(255,255,255,0.04)" }}>
            <motion.div className="h-full" style={{ background: "linear-gradient(90deg, #6366F1, #818CF8)" }}
              animate={{ width: `${pct}%` }} transition={{ duration: 0.3 }} />
          </div>
        )}

        <div className="flex items-center gap-4 px-6 py-2.5">
          {/* Status */}
          <div className="flex items-center gap-2">
            <Activity size={14} color={isActive ? "#818CF8" : "#10B981"} />
            <span style={{ fontSize: 12, fontWeight: 500, color: isActive ? "#A5B4FC" : "#6EE7B7" }}>
              {isActive ? `Scanning ${job?.path?.split(/[/\\]/).pop() ?? ""}` : "Scan completed"}
            </span>
          </div>

          {/* Metrics */}
          {isActive && progress && (
            <div className="flex items-center gap-4 font-mono text-xs" style={{ color: "#6060A0" }}>
              <span>{progress.processed.toLocaleString()} / {progress.total_files.toLocaleString()} files</span>
              <span>{pct}%</span>
              {progress.current_path && <span className="max-w-xs truncate">{progress.current_path.split(/[/\\]/).pop()}</span>}
            </div>
          )}

          {/* Completed summary */}
          {showCompleted && job && (
            <div className="font-mono text-xs" style={{ color: "#6EE7B7" }}>
              {job.total_files.toLocaleString()} files indexed
            </div>
          )}

          <div className="flex-1" />

          {/* Actions */}
          {isActive && (
            <div className="flex items-center gap-1.5">
              {job?.status === "paused" ? (
                <button onClick={resumeScan} className="cursor-pointer rounded-md p-1.5 transition-colors hover:bg-white/5">
                  <Play size={14} color="#10B981" />
                </button>
              ) : (
                <button onClick={pauseScan} className="cursor-pointer rounded-md p-1.5 transition-colors hover:bg-white/5">
                  <Pause size={14} color="#F59E0B" />
                </button>
              )}
              <button onClick={cancelScan} className="cursor-pointer rounded-md p-1.5 transition-colors hover:bg-white/5">
                <Square size={14} color="#EF4444" />
              </button>
            </div>
          )}

          {/* Open Files */}
          <button onClick={() => navigate("/scanner")}
            className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors" style={{ background: "rgba(99,102,241,0.1)", color: "#818CF8" }}>
            View
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
