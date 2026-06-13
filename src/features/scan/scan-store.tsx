import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { ipc } from "../../lib/ipc";
import type { ScanJob, ScanProgress } from "../../types/ipc";

export type ScanJobContextType = {
  job: ScanJob | null;
  progress: ScanProgress | null;
  startScan: (path: string, source: "manual" | "watch-folder", watchFolderId?: string) => Promise<void>;
  pauseScan: () => Promise<void>;
  resumeScan: () => Promise<void>;
  cancelScan: () => Promise<void>;
};

const ScanJobContext = createContext<ScanJobContextType>({
  job: null,
  progress: null,
  startScan: async () => {},
  pauseScan: async () => {},
  resumeScan: async () => {},
  cancelScan: async () => {},
});

export const useScanJob = () => useContext(ScanJobContext);

export function ScanJobProvider({ children }: { children: ReactNode }) {
  const [job, setJob] = useState<ScanJob | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll active scan job on mount (recover if scan was running before page mount)
  useEffect(() => {
    ipc.getActiveScanJob().then((j) => { if (j) setJob(j); }).catch(() => {});
    // Poll every 1s while scanning
    pollingRef.current = setInterval(() => {
      ipc.getActiveScanJob().then((j) => {
        if (j && (j.status === "counting" || j.status === "scanning" || j.status === "paused")) {
          setJob(j);
        } else if (!j || j.status === "completed" || j.status === "cancelled" || j.status === "error") {
          setJob(j ?? null);
          if (pollingRef.current && (!j || j.status !== "counting" && j.status !== "scanning" && j.status !== "paused")) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        }
      }).catch(() => {});
    }, 1000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  // Listen to scan:progress events globally
  useEffect(() => {
    (async () => {
      const unlisten = await listen<ScanProgress>("scan:progress", (e) => {
        const p = e.payload;
        setProgress(p);
        // Also update job state from progress
        setJob((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            status: p.phase === "Counting" ? "counting" : p.phase === "Scanning" ? "scanning" : (p.phase === "Done" ? "completed" : prev.status),
            processed: p.processed,
            total_files: p.total_files,
            current_path: p.current_path,
            current_dir: p.current_dir,
          };
        });
      });
      unlistenRef.current = unlisten;
    })();
    return () => { unlistenRef.current?.(); };
  }, []);

  const startScan = useCallback(async (path: string, source: "manual" | "watch-folder", watchFolderId?: string) => {
    if (job?.status === "counting" || job?.status === "scanning") return; // already active

    setJob({
      id: crypto.randomUUID(), path, source, watch_folder_id: watchFolderId,
      status: "counting", processed: 0, total_files: 0,
    });
    setProgress(null);

    try {
      await ipc.scanFolder(path);
      // After completion, poll for final state
      const j = await ipc.getActiveScanJob().catch(() => null);
      setJob(j ?? { ...job!, status: "completed", finished_at: new Date().toISOString() });
    } catch (err) {
      setJob((prev) => ({ ...prev!, status: "error", error_message: err instanceof Error ? err.message : String(err) }));
    }
  }, [job]);

  const pauseScan = useCallback(async () => {
    await ipc.pauseScan();
    setJob((prev) => prev ? { ...prev, status: "paused" } : prev);
  }, []);

  const resumeScan = useCallback(async () => {
    await ipc.resumeScan();
    setJob((prev) => prev ? { ...prev, status: "scanning" } : prev);
  }, []);

  const cancelScan = useCallback(async () => {
    await ipc.cancelScan();
    setJob((prev) => prev ? { ...prev, status: "cancelled", finished_at: new Date().toISOString() } : prev);
  }, []);

  return (
    <ScanJobContext.Provider value={{ job, progress, startScan, pauseScan, resumeScan, cancelScan }}>
      {children}
    </ScanJobContext.Provider>
  );
}
