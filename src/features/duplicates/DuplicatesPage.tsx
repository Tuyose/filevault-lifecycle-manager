import { useEffect, useState } from "react";

import { ipc } from "../../lib/ipc";
import type { DuplicateGroup } from "../../types/ipc";
import { StatCard } from "../../components/ui/StatCard";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const power = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, power);
  return `${value.toFixed(power === 0 ? 0 : 1)} ${units[power]}`;
}

function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}

export function DuplicatesPage() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ipc
      .getDuplicateGroups()
      .then((g) => { if (!cancelled) setGroups(g); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const totalDuplicateFiles = groups.reduce((sum, g) => sum + g.total_files, 0);
  const totalWasted = groups.reduce((sum, g) => sum + g.total_wasted_bytes, 0);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-vault-muted">
        Scanning for duplicates…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-rose-700/40 bg-rose-950/30 p-4 text-sm text-rose-200">
          {error}
        </div>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <section className="flex h-full flex-col gap-6 p-8">
        <h1 className="text-2xl font-semibold text-slate-100">Duplicates</h1>
        <p className="max-w-2xl text-sm text-vault-muted">
          No duplicate files found. Run a scan from the Scanner tab first,
          then check back here. Duplicate detection uses file size as a
          pre-filter and BLAKE3 hashing for the definitive check.
        </p>
      </section>
    );
  }

  return (
    <section className="flex h-full flex-col gap-6 overflow-y-auto p-8">
      <header>
        <h1 className="text-2xl font-semibold text-slate-100">Duplicates</h1>
        <p className="mt-1 text-sm text-vault-muted">
          Files sharing the same BLAKE3 content hash. Only active files are considered.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Groups" value={groups.length.toString()} />
        <StatCard label="Duplicate files" value={totalDuplicateFiles.toString()} />
        <StatCard
          label="Potential saved space"
          value={formatBytes(totalWasted)}
          hint={`${((totalWasted - totalWasted / totalDuplicateFiles) / totalWasted * 100).toFixed(0)}% reclaimable`}
          tone="warn"
        />
      </div>

      <div className="flex flex-col gap-4">
        {groups.map((group) => {
          const wastedPerFile = group.total_wasted_bytes / group.total_files;
          return (
            <div
              key={group.hash}
              className="rounded-xl border border-vault-border bg-vault-surface p-5"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <code className="font-mono text-xs text-vault-accent">
                      {truncateHash(group.hash)}
                    </code>
                    <span className="text-xs text-vault-muted">
                      {group.total_files} files · {formatBytes(group.total_wasted_bytes)} total
                    </span>
                  </div>
                </div>
                <span className="shrink-0 rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-300">
                  {formatBytes(group.total_wasted_bytes - wastedPerFile)} reclaimable
                </span>
              </div>

              <ul className="mt-3 space-y-1">
                {group.files.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center gap-3 rounded-md bg-vault-bg px-3 py-1.5 font-mono text-xs text-slate-300"
                  >
                    <span className="w-16 shrink-0 text-vault-muted">
                      {formatBytes(f.size_bytes)}
                    </span>
                    <span className="min-w-0 truncate">{f.path}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
