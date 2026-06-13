import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { dialogs, ipc } from "../../lib/ipc";
import type { ScanProgress, ScanRun, ScanStats, ScanSummary } from "../../types/ipc";
import { StatCard } from "../../components/ui/StatCard";

type Phase = "idle" | "counting" | "scanning" | "paused" | "done" | "error" | "cancelled";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const power = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, power);
  return `${value.toFixed(power === 0 ? 0 : 1)} ${units[power]}`;
}

function formatDuration(startedAt: string, finishedAt: string): string {
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  const ms = Math.max(0, end - start);
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ScannerPage() {
  const [folder, setFolder] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [stats, setStats] = useState<ScanStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [history, setHistory] = useState<ScanRun[]>([]);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      unlistenRef.current?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    ipc.getScanStats().then((v) => { if (!cancelled) setStats(v); }).catch(() => {});
    ipc.getScanHistory().then((v) => { if (!cancelled) setHistory(v); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function handlePickFolder() {
    setError(null);
    try {
      const picked = await dialogs.pickFolder();
      if (picked) setFolder(picked);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleScan() {
    if (!folder) return;

    const unlisten = await listen<ScanProgress>("scan:progress", (event) => {
      const p = event.payload;
      setProgress(p);
      if (p.phase === "Counting") setPhase("counting");
      else if (p.phase === "Scanning") setPhase("scanning");
      else if (p.phase === "Done") setPhase("done");
    });
    unlistenRef.current?.();
    unlistenRef.current = unlisten;

    setPhase("counting");
    setError(null);
    setSummary(null);
    setProgress(null);

    try {
      const result = await ipc.scanFolder(folder);
      setSummary(result);
      const [next, h] = await Promise.all([
        ipc.getScanStats(),
        ipc.getScanHistory(),
      ]);
      setStats(next);
      setHistory(h);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      if (phase !== "cancelled") setPhase("error");
    }
  }

  async function handlePause() {
    await ipc.pauseScan();
    setPhase("paused");
  }

  async function handleResume() {
    await ipc.resumeScan();
    setPhase("scanning");
  }

  async function handleCancel() {
    await ipc.cancelScan();
    setPhase("cancelled");
  }

  const progressPercent =
    progress && progress.total_files > 0
      ? Math.round((progress.processed / progress.total_files) * 100)
      : 0;

  const isScanning = phase === "counting" || phase === "scanning" || phase === "paused";

  return (
    <section className="flex h-full flex-col gap-6 p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-slate-100">Scanner</h1>
        <p className="max-w-2xl text-sm text-vault-muted">
          Pick a folder, hit Scan. FileVault walks the tree, reads
          metadata, and writes one row per file into the local SQLite
          database. Nothing is moved or deleted during a scan.
        </p>
      </header>

      {/* ── Folder picker + action bar ── */}
      <div className="rounded-xl border border-vault-border bg-vault-surface p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-widest text-vault-muted">Folder</label>
            <div className="flex min-w-96 items-center gap-2 rounded-md border border-vault-border bg-vault-bg px-3 py-2 font-mono text-sm text-slate-200">
              {folder ?? <span className="text-vault-muted">No folder selected</span>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePickFolder}
              disabled={isScanning}
              className="rounded-md border border-vault-border bg-vault-bg px-3 py-2 text-sm text-slate-100 transition-colors hover:border-vault-accent hover:text-vault-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              Select folder
            </button>

            {isScanning ? (
              <>
                {phase === "paused" ? (
                  <button
                    type="button"
                    onClick={handleResume}
                    className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 transition-colors hover:bg-emerald-500/20"
                  >
                    Resume
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handlePause}
                    className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300 transition-colors hover:bg-amber-500/20"
                  >
                    Pause
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCancel}
                  className="rounded-md border border-rose-600/40 bg-rose-600/10 px-3 py-2 text-sm text-rose-300 transition-colors hover:bg-rose-600/20"
                >
                  Stop
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleScan}
                disabled={!folder}
                className="rounded-md border border-vault-accent/40 bg-vault-accent/10 px-3 py-2 text-sm text-vault-accent transition-colors hover:bg-vault-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Scan folder
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-rose-700/40 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">{error}</div>
        )}
      </div>

      {/* ── Live progress ── */}
      {isScanning && progress && (
        <div className="relative rounded-xl border border-vault-border bg-vault-surface p-5">
          {phase === "paused" && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/40">
              <span className="rounded-md bg-amber-500/20 px-4 py-1.5 text-sm font-semibold tracking-widest text-amber-300">
                PAUSED
              </span>
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-sm font-semibold text-slate-100">
                {phase === "counting"
                  ? "Counting files…"
                  : `Scanning ${progress.processed} of ${progress.total_files} files`}
              </h2>
              <span className="shrink-0 font-mono text-xs text-vault-accent">{progressPercent}%</span>
            </div>

            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-vault-bg">
              <div
                className="h-full rounded-full bg-vault-accent transition-all duration-300 ease-out"
                style={{
                  width: phase === "counting" ? "100%" : `${progressPercent}%`,
                  animation: phase === "counting" ? "shimmer 1.5s ease-in-out infinite" : "none",
                }}
              />
            </div>

            {phase === "scanning" && progress.current_path && (
              <div className="mt-3 space-y-0.5 overflow-hidden text-xs text-vault-muted">
                <div className="truncate">
                  <span className="text-vault-accent/70">file:</span> {progress.current_path}
                </div>
                <div className="truncate">
                  <span className="text-vault-accent/70">dir: </span> {progress.current_dir}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Cancelled state ── */}
      {phase === "cancelled" && (
        <div className="rounded-xl border border-rose-700/30 bg-rose-950/20 p-5 text-sm">
          <span className="font-semibold text-rose-200">Scan cancelled</span>
          <span className="ml-2 text-vault-muted">
            by user. No files were modified. Head to Dashboard to see
            the current tracked count.
          </span>
        </div>
      )}

      {/* ── Existing stats ── */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Tracked files" value={stats.total.toString()} hint={`${formatBytes(stats.total_bytes)} total`} />
          <StatCard label="Active" value={stats.active.toString()} tone="ok" />
          <StatCard label="Archived" value={stats.archived.toString()} />
          <StatCard label="Trashed" value={stats.trashed.toString()} />
        </div>
      )}

      {summary && <ScanResultCard summary={summary} />}

      {/* ── Scan history ── */}
      {history.length > 0 && <ScanHistoryCard history={history} />}
    </section>
  );
}

function ScanResultCard({ summary }: { summary: ScanSummary }) {
  return (
    <div className="rounded-xl border border-vault-border bg-vault-surface p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Last scan</h2>
          <p className="mt-0.5 font-mono text-xs text-vault-muted">{summary.root}</p>
        </div>
        <span
          className={
            summary.errors === 0
              ? "rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300"
              : summary.inserted + summary.updated > 0
                ? "rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-300"
                : "rounded-md bg-vault-bg px-2 py-1 text-xs text-vault-muted"
          }
        >
          {summary.errors === 0 ? "ok" : `${summary.errors} error${summary.errors === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Total seen" value={summary.total_seen.toString()} />
        <StatCard label="Inserted" value={summary.inserted.toString()} tone="ok" />
        <StatCard label="Updated" value={summary.updated.toString()} tone="ok" />
        <StatCard label="Errors" value={summary.errors.toString()} />
        <StatCard label="Duration" value={formatDuration(summary.started_at, summary.finished_at)} />
      </div>

      <div className="mt-3 text-xs text-vault-muted">Combined size: {formatBytes(summary.total_bytes)}</div>

      {summary.error_samples.length > 0 && (
        <details className="mt-4 rounded-md border border-vault-border bg-vault-bg p-3">
          <summary className="cursor-pointer text-xs text-vault-muted">
            Show error samples ({summary.error_samples.length})
          </summary>
          <ul className="mt-2 space-y-1 font-mono text-xs text-rose-200">
            {summary.error_samples.map((sample, idx) => (
              <li key={`${sample.path}-${idx}`}>
                <span className="text-rose-300">{sample.path}</span>
                <span className="text-vault-muted"> — {sample.message}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ScanHistoryCard({ history }: { history: ScanRun[] }) {
  return (
    <div className="rounded-xl border border-vault-border bg-vault-surface p-5">
      <h2 className="text-base font-semibold text-slate-100">Scan history</h2>
      <p className="mt-0.5 text-xs text-vault-muted">Last {history.length} runs, newest first</p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-vault-border text-xs uppercase tracking-widest text-vault-muted">
              <th className="pb-2 pr-4">When</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">Files</th>
              <th className="pb-2 pr-4">New</th>
              <th className="pb-2 pr-4">Duration</th>
              <th className="pb-2 pr-4">Size</th>
              <th className="pb-2">Root</th>
            </tr>
          </thead>
          <tbody>
            {history.map((run) => (
              <tr key={run.id} className="border-b border-vault-border/40 text-slate-200 last:border-0">
                <td className="py-2 pr-4 text-xs text-vault-muted">{formatTime(run.finished_at)}</td>
                <td className="py-2 pr-4">
                  <span
                    className={
                      run.status === "completed"
                        ? "text-emerald-300"
                        : run.status === "cancelled"
                          ? "text-amber-300"
                          : "text-rose-300"
                    }
                  >
                    {run.status}
                  </span>
                </td>
                <td className="py-2 pr-4 font-mono">{run.total_seen}</td>
                <td className="py-2 pr-4 font-mono text-emerald-300">{run.inserted}</td>
                <td className="py-2 pr-4 font-mono text-vault-muted">
                  {formatDuration(run.started_at, run.finished_at)}
                </td>
                <td className="py-2 pr-4 font-mono text-vault-muted">{formatBytes(run.total_bytes)}</td>
                <td className="py-2 max-w-64 truncate font-mono text-xs text-vault-muted">
                  {run.root_path}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
