import { useEffect, useState } from "react";

import { dialogs, ipc } from "../../lib/ipc";
import type { ScanStats, ScanSummary } from "../../types/ipc";
import { StatCard } from "../../components/ui/StatCard";

type Phase = "idle" | "scanning" | "done" | "error";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const power = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
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

export function ScannerPage() {
  const [folder, setFolder] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [stats, setStats] = useState<ScanStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ipc
      .getScanStats()
      .then((value) => {
        if (!cancelled) setStats(value);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          // Non-fatal — surface as a banner if it ever happens.
          console.warn("getScanStats failed", err);
        }
      });
    return () => {
      cancelled = true;
    };
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
    setPhase("scanning");
    setError(null);
    setSummary(null);
    try {
      const result = await ipc.scanFolder(folder);
      setSummary(result);
      setPhase("done");
      const next = await ipc.getScanStats();
      setStats(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

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

      <div className="rounded-xl border border-vault-border bg-vault-surface p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-widest text-vault-muted">
              Folder
            </label>
            <div className="flex min-w-96 items-center gap-2 rounded-md border border-vault-border bg-vault-bg px-3 py-2 font-mono text-sm text-slate-200">
              {folder ?? <span className="text-vault-muted">No folder selected</span>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePickFolder}
              className="rounded-md border border-vault-border bg-vault-bg px-3 py-2 text-sm text-slate-100 hover:border-vault-accent hover:text-vault-accent"
            >
              Select folder
            </button>
            <button
              type="button"
              onClick={handleScan}
              disabled={!folder || phase === "scanning"}
              className="rounded-md border border-vault-accent/40 bg-vault-accent/10 px-3 py-2 text-sm text-vault-accent transition-colors hover:bg-vault-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {phase === "scanning" ? "Scanning…" : "Scan folder"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-rose-700/40 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="Tracked files"
            value={stats.total.toString()}
            hint={`${formatBytes(stats.total_bytes)} total`}
          />
          <StatCard label="Active" value={stats.active.toString()} tone="ok" />
          <StatCard label="Archived" value={stats.archived.toString()} />
          <StatCard label="Trashed" value={stats.trashed.toString()} />
        </div>
      )}

      {summary && <ScanResultCard summary={summary} />}
    </section>
  );
}

function ScanResultCard({ summary }: { summary: ScanSummary }) {
  const tone =
    summary.errors === 0
      ? "ok"
      : summary.inserted + summary.updated > 0
        ? "warn"
        : "default";

  return (
    <div className="rounded-xl border border-vault-border bg-vault-surface p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            Last scan
          </h2>
          <p className="mt-0.5 font-mono text-xs text-vault-muted">
            {summary.root}
          </p>
        </div>
        <span
          className={
            tone === "ok"
              ? "rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300"
              : tone === "warn"
                ? "rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-300"
                : "rounded-md bg-vault-bg px-2 py-1 text-xs text-vault-muted"
          }
        >
          {summary.errors === 0
            ? "ok"
            : `${summary.errors} error${summary.errors === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Total seen" value={summary.total_seen.toString()} />
        <StatCard
          label="Inserted"
          value={summary.inserted.toString()}
          tone="ok"
        />
        <StatCard
          label="Updated"
          value={summary.updated.toString()}
          tone="ok"
        />
        <StatCard label="Errors" value={summary.errors.toString()} />
        <StatCard
          label="Duration"
          value={formatDuration(summary.started_at, summary.finished_at)}
        />
      </div>

      <div className="mt-3 text-xs text-vault-muted">
        Combined size: {formatBytes(summary.total_bytes)}
      </div>

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
