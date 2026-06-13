import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { dialogs, ipc } from "../../lib/ipc";
import type { ScanProgress, ScanRun, DuplicateGroup } from "../../types/ipc";
import { StatCard } from "../../components/ui/StatCard";
import {
  formatBytes,
  formatDuration,
  formatTime,
  shortenPath,
  topDuplicateFolders,
  topFoldersBySize,
} from "../../lib/folder-insights";

type Phase = "idle" | "counting" | "scanning" | "paused" | "done" | "error" | "cancelled";

export function ScannerPage() {
  const [folder, setFolder] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [history, setHistory] = useState<ScanRun[]>([]);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => { unlistenRef.current?.(); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      ipc.getScanStats().catch(() => null),
      ipc.getScanHistory().catch(() => [] as ScanRun[]),
      ipc.getDuplicateGroups().catch(() => [] as DuplicateGroup[]),
    ]).then(([_, h, g]) => {
      if (!cancelled) { setHistory(h); setGroups(g); }
    });
    return () => { cancelled = true; };
  }, []);

  async function handlePickFolder() {
    setError(null);
    try { const picked = await dialogs.pickFolder(); if (picked) setFolder(picked); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  async function handleScan() {
    if (!folder) return;
    const unlisten = await listen<ScanProgress>("scan:progress", (event) => {
      const p = event.payload; setProgress(p);
      if (p.phase === "Counting") setPhase("counting");
      else if (p.phase === "Scanning") setPhase("scanning");
      else if (p.phase === "Done") setPhase("done");
    });
    unlistenRef.current?.();
    unlistenRef.current = unlisten;
    setPhase("counting"); setError(null); setProgress(null);
    try {
      await ipc.scanFolder(folder);
      const [h, g] = await Promise.all([
        ipc.getScanHistory().catch(() => [] as ScanRun[]),
        ipc.getDuplicateGroups().catch(() => [] as DuplicateGroup[]),
      ]);
      setHistory(h); setGroups(g);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      if (phase !== "cancelled") setPhase("error");
    }
  }

  async function handlePause() { await ipc.pauseScan(); setPhase("paused"); }
  async function handleResume() { await ipc.resumeScan(); setPhase("scanning"); }
  async function handleCancel() { await ipc.cancelScan(); setPhase("cancelled"); }

  const progressPercent = progress && progress.total_files > 0
    ? Math.round((progress.processed / progress.total_files) * 100) : 0;
  const isScanning = phase === "counting" || phase === "scanning" || phase === "paused";
  const latestRun = history.length > 0 ? history[0] : null;

  const totalDuplicateFiles = groups.reduce((s, g) => s + g.total_files, 0);
  const totalWasted = groups.reduce((s, g) => s + g.total_wasted_bytes, 0);
  const topFolders = topFoldersBySize(groups, 5);
  const hotspots = topDuplicateFolders(groups, 5);
  const maxHotspot = hotspots.length > 0 ? hotspots[0].duplicate_bytes : 0;

  return (
    <section className="flex h-full flex-col gap-6 overflow-y-auto p-8">
      {/* ── Header + folder picker ── */}
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-slate-100">Scanner</h1>
        <p className="max-w-2xl text-sm text-vault-muted">
          Pick a folder, hit Scan. FileVault indexes every file, hashes it with
          BLAKE3, and detects duplicates — all local, nothing leaves your machine.
        </p>
      </header>

      <div className="rounded-xl border border-vault-border bg-vault-surface p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-widest text-vault-muted">Folder</label>
            <div className="flex min-w-96 items-center gap-2 rounded-md border border-vault-border bg-vault-bg px-3 py-2 font-mono text-sm text-slate-200">
              {folder ?? <span className="text-vault-muted">No folder selected</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handlePickFolder} disabled={isScanning}
              className="rounded-md border border-vault-border bg-vault-bg px-3 py-2 text-sm text-slate-100 transition-colors hover:border-vault-accent hover:text-vault-accent disabled:cursor-not-allowed disabled:opacity-40">
              Select folder
            </button>
            {isScanning ? (
              <>
                {phase === "paused" ? (
                  <button type="button" onClick={handleResume}
                    className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 transition-colors hover:bg-emerald-500/20">Resume</button>
                ) : (
                  <button type="button" onClick={handlePause}
                    className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300 transition-colors hover:bg-amber-500/20">Pause</button>
                )}
                <button type="button" onClick={handleCancel}
                  className="rounded-md border border-rose-600/40 bg-rose-600/10 px-3 py-2 text-sm text-rose-300 transition-colors hover:bg-rose-600/20">Stop</button>
              </>
            ) : (
              <button type="button" onClick={handleScan} disabled={!folder}
                className="rounded-md border border-vault-accent/40 bg-vault-accent/10 px-3 py-2 text-sm text-vault-accent transition-colors hover:bg-vault-accent/20 disabled:cursor-not-allowed disabled:opacity-40">Scan folder</button>
            )}
          </div>
        </div>
        {error && <div className="mt-4 rounded-md border border-rose-700/40 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">{error}</div>}
      </div>

      {/* ── Live progress ── */}
      {isScanning && progress && (
        <div className="relative rounded-xl border border-vault-border bg-vault-surface p-5">
          {phase === "paused" && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/40">
              <span className="rounded-md bg-amber-500/20 px-4 py-1.5 text-sm font-semibold tracking-widest text-amber-300">PAUSED</span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-sm font-semibold text-slate-100">
                {phase === "counting" ? "Counting files…" : `Scanning ${progress.processed} of ${progress.total_files} files`}
              </h2>
              <span className="shrink-0 font-mono text-xs text-vault-accent">{progressPercent}%</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-vault-bg">
              <div className="h-full rounded-full bg-vault-accent transition-all duration-300 ease-out"
                style={{ width: phase === "counting" ? "100%" : `${progressPercent}%`, animation: phase === "counting" ? "shimmer 1.5s ease-in-out infinite" : "none" }} />
            </div>
            {phase === "scanning" && progress.current_path && (
              <div className="mt-3 space-y-0.5 overflow-hidden text-xs text-vault-muted">
                <div className="truncate"><span className="text-vault-accent/70">file:</span> {progress.current_path}</div>
                <div className="truncate"><span className="text-vault-accent/70">dir: </span> {progress.current_dir}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {phase === "cancelled" && (
        <div className="rounded-xl border border-rose-700/30 bg-rose-950/20 p-5 text-sm">
          <span className="font-semibold text-rose-200">Scan cancelled</span>
          <span className="ml-2 text-vault-muted">by user.</span>
        </div>
      )}

      {/* ── Last Scan Overview ── */}
      {groups.length > 0 && latestRun && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-slate-100">Last Scan Overview</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Total files" value={latestRun.total_seen.toString()} hint="scan run" />
            <StatCard label="Total size" value={formatBytes(latestRun.total_bytes)} />
            <StatCard label="Duplicate groups" value={groups.length.toString()} />
            <StatCard label="Duplicate files" value={totalDuplicateFiles.toString()} />
            <StatCard label="Reclaimable" value={formatBytes(totalWasted)} tone="warn" />
            <StatCard label="Duration" value={formatDuration(latestRun.started_at, latestRun.finished_at)} />
          </div>
        </div>
      )}

      {/* ── Top Folders ── */}
      {topFolders.length > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-slate-100">Top Folders</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {topFolders.map((f) => {
              const maxVal = topFolders[0].total_bytes;
              const pct = maxVal > 0 ? (f.total_bytes / maxVal) * 100 : 0;
              return (
                <div key={f.path} className="rounded-xl border border-vault-border bg-vault-surface p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-xs text-slate-200" title={f.path}>
                      {shortenPath(f.path, 3)}
                    </span>
                    <span className="shrink-0 font-mono text-sm font-semibold text-slate-100">{formatBytes(f.total_bytes)}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-vault-bg">
                    <div className="h-full rounded-full bg-vault-accent/60" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Duplicate Hotspots ── */}
      {hotspots.length > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-slate-100">Duplicate Hotspots</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {hotspots.map((h) => {
              const pct = maxHotspot > 0 ? (h.duplicate_bytes / maxHotspot) * 100 : 0;
              return (
                <div key={h.path} className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-xs text-slate-200" title={h.path}>
                      {shortenPath(h.path, 3)}
                    </span>
                    <span className="shrink-0 font-mono text-sm font-semibold text-amber-300">{formatBytes(h.duplicate_bytes)}</span>
                  </div>
                  <div className="mt-1 text-xs text-vault-muted">
                    {h.duplicate_files} files · {h.duplicate_groups} groups
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-vault-bg">
                    <div className={`h-full rounded-full ${h.duplicate_bytes > 1_000_000_000 ? "bg-rose-500/60" : "bg-amber-500/60"}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Scan history with duplicate context ── */}
      {history.length > 0 && (
        <div className="rounded-xl border border-vault-border bg-vault-surface p-5">
          <h2 className="text-base font-semibold text-slate-100">Scan History</h2>
          <p className="mt-0.5 text-xs text-vault-muted">{history.length} runs, newest first</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-vault-border text-xs uppercase tracking-widest text-vault-muted">
                  <th className="pb-2 pr-3">Time</th>
                  <th className="pb-2 pr-3">Folder</th>
                  <th className="pb-2 pr-3 text-right">Files</th>
                  <th className="pb-2 pr-3 text-right">Size</th>
                  <th className="pb-2 pr-3 text-right">Duplicates</th>
                  <th className="pb-2 pr-3 text-right">Reclaim</th>
                  <th className="pb-2 pr-3 text-right">Duration</th>
                  <th className="pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((run) => (
                  <tr key={run.id} className="border-b border-vault-border/40 text-slate-200 last:border-0">
                    <td className="py-2 pr-3 text-xs text-vault-muted whitespace-nowrap">{formatTime(run.finished_at)}</td>
                    <td className="py-2 pr-3 max-w-48">
                      <span className="block truncate font-mono text-xs" title={run.root_path}>{shortenPath(run.root_path, 3)}</span>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono">{run.total_seen}</td>
                    <td className="py-2 pr-3 text-right font-mono text-vault-muted">{formatBytes(run.total_bytes)}</td>
                    <td className="py-2 pr-3 text-right font-mono text-amber-300">{`—`}</td>
                    <td className="py-2 pr-3 text-right font-mono text-vault-muted">{`—`}</td>
                    <td className="py-2 pr-3 text-right font-mono text-vault-muted">{formatDuration(run.started_at, run.finished_at)}</td>
                    <td className="py-2 text-right">
                      <span className={run.status === "completed" ? "text-emerald-300" : run.status === "cancelled" ? "text-amber-300" : "text-rose-300"}>
                        {run.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
