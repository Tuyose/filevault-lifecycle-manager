import { useEffect, useMemo, useState } from "react";

import { ipc } from "../../lib/ipc";
import type { DuplicateGroup } from "../../types/ipc";
import { StatCard } from "../../components/ui/StatCard";
import {
  formatBytes,
  shortenPath,
  topDuplicateFolders,
  groupGroupsByFolder,
  fileCategory,
} from "../../lib/folder-insights";

type SizeFilter = "all" | "100mb" | "500mb" | "1gb";
type CategoryFilter = "all" | "Images" | "Videos" | "Archives" | "APK" | "Other";

const SIZE_THRESHOLDS: Record<SizeFilter, number> = {
  all: 0,
  "100mb": 100 * 1024 * 1024,
  "500mb": 500 * 1024 * 1024,
  "1gb": 1024 * 1024 * 1024,
};

export function DuplicatesPage() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>("all");
  const [catFilter, setCatFilter] = useState<CategoryFilter>("all");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    ipc.getDuplicateGroups()
      .then((g) => { if (!cancelled) setGroups(g); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Apply filters
  const filtered = useMemo(() => {
    let result = groups;
    if (sizeFilter !== "all") {
      const threshold = SIZE_THRESHOLDS[sizeFilter];
      result = result.filter((g) => g.total_wasted_bytes >= threshold);
    }
    if (catFilter !== "all") {
      result = result.filter((g) => {
        const sample = g.files[0]?.path ?? "";
        return fileCategory(sample) === catFilter;
      });
    }
    return result;
  }, [groups, sizeFilter, catFilter]);

  const byFolder = useMemo(() => groupGroupsByFolder(filtered), [filtered]);

  // Sort folders by total duplicate bytes descending
  const sortedFolders = useMemo(() => {
    const folderGroups = Array.from(byFolder.entries());
    folderGroups.sort(([, a], [, b]) => {
      const wastedA = a.reduce((s, g) => s + g.total_wasted_bytes, 0);
      const wastedB = b.reduce((s, g) => s + g.total_wasted_bytes, 0);
      return wastedB - wastedA;
    });
    return folderGroups;
  }, [byFolder]);

  const totalDupFiles = filtered.reduce((s, g) => s + g.total_files, 0);
  const totalWasted = filtered.reduce((s, g) => s + g.total_wasted_bytes, 0);

  const hotspots = topDuplicateFolders(filtered, 1);
  const mostAffected = hotspots.length > 0 ? shortenPath(hotspots[0].path, 2) : "—";

  const toggleFolder = (folder: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder); else next.add(folder);
      return next;
    });
  };

  const toggleGroup = (hash: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash); else next.add(hash);
      return next;
    });
  };

  if (loading) return <div className="flex h-full items-center justify-center text-vault-muted">Loading…</div>;
  if (error) return <div className="flex h-full items-center justify-center p-8"><div className="max-w-md rounded-lg border border-rose-700/40 bg-rose-950/30 p-4 text-sm text-rose-200">{error}</div></div>;

  return (
    <section className="flex h-full flex-col gap-6 overflow-y-auto p-8">
      {/* ── Header ── */}
      <header>
        <h1 className="text-2xl font-semibold text-slate-100">Duplicates</h1>
        <p className="mt-1 text-sm text-vault-muted">
          Files sharing the same BLAKE3 content hash. Grouped by folder so you can see
          where the biggest savings are.
        </p>
      </header>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Groups" value={filtered.length.toString()} />
        <StatCard label="Duplicate files" value={totalDupFiles.toString()} />
        <StatCard label="Reclaimable" value={formatBytes(totalWasted)} tone="warn" />
        <StatCard label="Worst folder" value={mostAffected} hint="by duplicate bytes" />
      </div>

      {/* ── Quick filters ── */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs uppercase tracking-widest text-vault-muted">Size:</span>
        {(["all", "100mb", "500mb", "1gb"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setSizeFilter(s)}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              sizeFilter === s ? "bg-vault-accent/20 text-vault-accent" : "bg-vault-bg text-vault-muted hover:text-slate-100"
            }`}>{s === "all" ? "All sizes" : `> ${s.replace("mb", " MB").replace("gb", " GB")}`}</button>
        ))}
        <span className="ml-2 text-xs uppercase tracking-widest text-vault-muted">Type:</span>
        {(["all", "Images", "Videos", "Archives", "APK", "Other"] as const).map((c) => (
          <button key={c} type="button" onClick={() => setCatFilter(c)}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              catFilter === c ? "bg-vault-accent/20 text-vault-accent" : "bg-vault-bg text-vault-muted hover:text-slate-100"
            }`}>{c === "all" ? "All types" : c}</button>
        ))}
      </div>

      {/* ── Folder-first grouping ── */}
      {sortedFolders.length === 0 && (
        <div className="rounded-xl border border-dashed border-vault-border p-8 text-center text-sm text-vault-muted">
          {groups.length === 0 ? "No duplicates found. Run a scan first." : "No duplicates match the current filters."}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {sortedFolders.map(([folder, folderGroups]) => {
          const folderWasted = folderGroups.reduce((s, g) => s + g.total_wasted_bytes, 0);
          const folderFiles = folderGroups.reduce((s, g) => s + g.total_files, 0);
          const isExpanded = expandedFolders.has(folder);

          return (
            <div key={folder} className="rounded-xl border border-vault-border bg-vault-surface overflow-hidden">
              {/* Folder header */}
              <button type="button" onClick={() => toggleFolder(folder)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-white/5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs transition-transform ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                    <span className="font-mono text-sm font-semibold text-slate-100" title={folder}>
                      {shortenPath(folder, 4)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-vault-muted">
                    {folderGroups.length} groups · {folderFiles} files · {formatBytes(folderWasted)} reclaimable
                  </div>
                </div>
                <span className="shrink-0 rounded-md bg-amber-500/10 px-2.5 py-1 font-mono text-xs text-amber-300">
                  {formatBytes(folderWasted)}
                </span>
              </button>

              {/* Expanded: duplicate groups inside this folder */}
              {isExpanded && (
                <div className="border-t border-vault-border/50 px-5 py-3">
                  {folderGroups.map((group) => {
                    const sampleName = group.files[0]?.path.split(/[/\\]/).pop() ?? "unknown";
                    const gExpanded = expandedGroups.has(group.hash);
                    const wastePerKeep = group.total_wasted_bytes - (group.total_wasted_bytes / group.total_files);

                    return (
                      <div key={group.hash} className="mb-2 last:mb-0">
                        <button type="button" onClick={() => toggleGroup(group.hash)}
                          className="flex w-full items-center justify-between gap-3 rounded-lg bg-vault-bg px-3 py-2 text-left transition-colors hover:bg-white/5">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] text-vault-muted transition-transform ${gExpanded ? "rotate-90" : ""}`}>▶</span>
                              <span className="truncate font-mono text-xs text-slate-200">{sampleName}</span>
                              <span className="shrink-0 text-xs text-vault-muted">×{group.total_files}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-xs text-vault-muted">{formatBytes(group.total_wasted_bytes)}</span>
                            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-[11px] text-amber-300">{formatBytes(wastePerKeep)}</span>
                          </div>
                        </button>

                        {/* Expanded: file list + hash */}
                        {gExpanded && (
                          <div className="ml-4 mt-1 space-y-0.5">
                            <div className="rounded bg-vault-bg/60 px-3 py-1.5 font-mono text-[11px] text-vault-muted break-all">
                              Hash: {group.hash}
                            </div>
                            {group.files.map((f) => (
                              <div key={f.id} className="flex items-center gap-3 rounded bg-vault-bg/40 px-3 py-1 font-mono text-[11px] text-slate-300">
                                <span className="w-14 shrink-0 text-vault-muted">{formatBytes(f.size_bytes)}</span>
                                <span className="min-w-0 truncate" title={f.path}>{f.path}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
