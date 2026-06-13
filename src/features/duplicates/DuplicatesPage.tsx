import { useEffect, useMemo, useState } from "react";

import { ipc } from "../../lib/ipc";
import type { ArchiveInfo, DuplicateGroup, ScanRun } from "../../types/ipc";
import { StatCard } from "../../components/ui/StatCard";
import { FileActionMenu } from "../../components/file-actions/FileActionMenu";
import {
  formatBytes,
  shortenPath,
  topDuplicateFolders,
  groupGroupsByScanRoot,
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

/** Sum wasted bytes across all folders in a root map. */
function sumFolderWasted(folders: Map<string, DuplicateGroup[]>): number {
  let total = 0;
  for (const groups of folders.values()) {
    total += groups.reduce((s, g) => s + g.total_wasted_bytes, 0);
  }
  return total;
}

/** Sum total files across all folders in a root map. */
function sumFolderFiles(folders: Map<string, DuplicateGroup[]>): number {
  let total = 0;
  for (const groups of folders.values()) {
    total += groups.reduce((s, g) => s + g.total_files, 0);
  }
  return total;
}

/** Sum total groups across all folders in a root map. */
function sumFolderGroups(folders: Map<string, DuplicateGroup[]>): number {
  let total = 0;
  for (const groups of folders.values()) {
    total += groups.length;
  }
  return total;
}

function buildCategories(groups: DuplicateGroup[]): { category: string; count: number; files: number; bytes: number }[] {
  const byCat = new Map<string, { count: number; files: number; bytes: number }>();
  for (const group of groups) {
    const sample = group.files[0]?.path ?? "";
    const cat = fileCategory(sample);
    const entry = byCat.get(cat) ?? { count: 0, files: 0, bytes: 0 };
    entry.count += 1;
    entry.files += group.total_files;
    entry.bytes += group.total_wasted_bytes;
    byCat.set(cat, entry);
  }
  return Array.from(byCat.entries())
    .map(([category, data]) => ({ category, ...data }))
    .sort((a, b) => b.bytes - a.bytes);
}

export function DuplicatesPage() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [archiveInfo, setArchiveInfo] = useState<ArchiveInfo | null>(null);
  const [roots, setRoots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>("all");
  const [catFilter, setCatFilter] = useState<CategoryFilter>("all");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      ipc.getDuplicateGroups(),
      ipc.getScanHistory().catch(() => [] as ScanRun[]),
      ipc.getArchiveInfo().catch(() => null),
    ])
      .then(([g, h, ai]) => {
        if (!cancelled) {
          setGroups(g);
          setRoots(h.map((r) => r.root_path));
          setArchiveInfo(ai ?? null);
        }
      })
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

  const byFolder = useMemo(() => groupGroupsByScanRoot(filtered, roots), [filtered, roots]);

  // Sort roots by total wasted bytes descending
  const sortedRoots = useMemo(() => {
    const entries = Array.from(byFolder.entries());
    entries.sort(([, aFolders], [, bFolders]) => {
      const wastedA = sumFolderWasted(aFolders);
      const wastedB = sumFolderWasted(bFolders);
      return wastedB - wastedA;
    });
    return entries;
  }, [byFolder]);

  const totalDupFiles = filtered.reduce((s, g) => s + g.total_files, 0);
  const totalWasted = filtered.reduce((s, g) => s + g.total_wasted_bytes, 0);

  const hotspots = topDuplicateFolders(filtered, 1);
  const mostAffected = hotspots.length > 0 ? shortenPath(hotspots[0].path, 2) : "—";

  const toggleRoot = (root: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(root)) next.delete(root); else next.add(root);
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
          Files grouped by scan root, then folder. This keeps duplicates from different
          projects separate even if they share the same file name.
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

      {/* ── Top Duplicate Categories ── */}
      {filtered.length > 0 && (
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-vault-muted/70">Top Duplicate Categories</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {buildCategories(filtered).slice(0, 5).map((cat) => (
              <button
                key={cat.category}
                type="button"
                onClick={() => setCatFilter(cat.category as any)}
                className={`rounded-[14px] border p-4 text-left transition-all duration-[180ms] ${
                  catFilter === cat.category
                    ? "border-vault-accent/30 bg-vault-accent/8"
                    : "border-vault-border bg-vault-surface hover:border-vault-border/80"
                }`}
              >
                <div className="text-sm font-semibold text-slate-100">{cat.category}</div>
                <div className="mt-1 text-xs text-vault-muted">{cat.count} groups</div>
                <div className="mt-0.5 font-mono text-xs text-amber-300">{formatBytes(cat.bytes)}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Folder Ranking ── */}
      {hotspots.length > 0 && (
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-vault-muted/70">Top Duplicate Folders</h3>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {hotspots.slice(0, 6).map((h) => {
              const maxH = hotspots.length > 0 ? hotspots[0].duplicate_bytes : 0;
              const pct = maxH > 0 ? (h.duplicate_bytes / maxH) * 100 : 0;
              return (
                <div key={h.path} className="flex items-center gap-3 rounded-[10px] bg-vault-surface/40 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs text-slate-200" title={h.path}>
                      {shortenPath(h.path, 3)}
                    </div>
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-vault-bg">
                      <div className="h-full rounded-full bg-amber-500/40" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-xs font-semibold text-amber-300">{formatBytes(h.duplicate_bytes)}</div>
                    <div className="text-[11px] text-vault-muted/50">{h.duplicate_files} files</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Root-first grouping ── */}
      {sortedRoots.length === 0 && (
        <div className="rounded-xl border border-dashed border-vault-border p-8 text-center text-sm text-vault-muted">
          {groups.length === 0 ? "No duplicates found. Run a scan first." : "No duplicates match the current filters."}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {sortedRoots.map(([root, folders]) => {
          const rootWasted = sumFolderWasted(folders);
          const rootFiles = sumFolderFiles(folders);
          const rootGroups = sumFolderGroups(folders);
          const isRootExpanded = expandedFolders.has(root);
          const rootLabel = shortenPath(root, 2);

          return (
            <div key={root} className="rounded-xl border border-vault-border bg-vault-surface overflow-hidden">
              {/* Root header */}
              <button type="button" onClick={() => toggleRoot(root)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-white/5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs transition-transform ${isRootExpanded ? "rotate-90" : ""}`}>▶</span>
                    <span className="font-mono text-sm font-semibold text-slate-100" title={root}>
                      {rootLabel}
                    </span>
                    <span className="rounded-md bg-vault-bg px-1.5 py-0.5 font-mono text-[11px] text-vault-muted">
                      {rootGroups} groups
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-vault-muted">
                    {rootFiles} files · {formatBytes(rootWasted)} reclaimable
                  </div>
                </div>
                <span className="shrink-0 rounded-md bg-amber-500/10 px-2.5 py-1 font-mono text-xs text-amber-300">
                  {formatBytes(rootWasted)}
                </span>
              </button>

              {/* Expanded: sub-folders with groups */}
              {isRootExpanded && (
                <div className="border-t border-vault-border/50 px-5 py-3 space-y-3">
                  {Array.from(folders.entries())
                    .sort(([, a], [, b]) => {
                      const wa = a.reduce((s, g) => s + g.total_wasted_bytes, 0);
                      const wb = b.reduce((s, g) => s + g.total_wasted_bytes, 0);
                      return wb - wa;
                    })
                    .map(([folder, folderGroups]) => {
                      const folderWasted = folderGroups.reduce((s, g) => s + g.total_wasted_bytes, 0);
                      const folderFiles = folderGroups.reduce((s, g) => s + g.total_files, 0);
                      const fKey = `${root}::${folder}`;
                      const isFolderExpanded = expandedFolders.has(fKey);

                      return (
                        <div key={fKey}>
                          {/* Sub-folder header */}
                          <button type="button" onClick={() => toggleRoot(fKey)}
                            className="flex w-full items-center justify-between gap-3 rounded-lg bg-vault-bg px-3 py-2 text-left transition-colors hover:bg-white/5">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] text-vault-muted transition-transform ${isFolderExpanded ? "rotate-90" : ""}`}>▶</span>
                                <span className="font-mono text-xs text-slate-200" title={folder}>
                                  {folder === "/" ? "/" : shortenPath(folder, 3)}
                                </span>
                              </div>
                              <div className="mt-0.5 text-[11px] text-vault-muted">
                                {folderGroups.length} groups · {folderFiles} files · {formatBytes(folderWasted)}
                              </div>
                            </div>
                            <span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-[11px] text-amber-300">
                              {formatBytes(folderWasted)}
                            </span>
                          </button>

                          {/* Expanded: groups inside this sub-folder */}
                          {isFolderExpanded && (
                            <div className="ml-3 mt-1 space-y-1">
                              {folderGroups.map((group) => {
                                const sampleName = group.files[0]?.path.split(/[/\\]/).pop() ?? "unknown";
                                const gExpanded = expandedGroups.has(group.hash);
                                const wastePerKeep = group.total_wasted_bytes - (group.total_wasted_bytes / group.total_files);

                                return (
                                  <div key={group.hash}>
                                    <button type="button" onClick={() => toggleGroup(group.hash)}
                                      className="flex w-full items-center justify-between gap-2 rounded-md bg-vault-bg/60 px-3 py-1.5 text-left transition-colors hover:bg-white/5">
                                      <div className="min-w-0 flex-1 flex items-center gap-2">
                                        <span className={`text-[10px] text-vault-muted transition-transform ${gExpanded ? "rotate-90" : ""}`}>▶</span>
                                        <span className="truncate font-mono text-xs text-slate-200">{sampleName}</span>
                                        <span className="shrink-0 text-xs text-vault-muted">×{group.total_files}</span>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <span className="font-mono text-xs text-vault-muted">{formatBytes(group.total_wasted_bytes)}</span>
                                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-[11px] text-amber-300">{formatBytes(wastePerKeep)}</span>
                                      </div>
                                    </button>

                                    {gExpanded && (
                                      <div className="ml-4 mt-0.5 space-y-0.5">
                                        <div className="rounded bg-vault-bg/40 px-3 py-1 font-mono text-[11px] text-vault-muted break-all">
                                          Hash: {group.hash}
                                        </div>
                                        {group.files.map((f) => (
                                          <div key={f.id} className="flex items-center gap-3 rounded bg-vault-bg/30 px-3 py-0.5 font-mono text-[11px] text-slate-300">
                                            <span className="w-14 shrink-0 text-vault-muted">{formatBytes(f.size_bytes)}</span>
                                            <span className="min-w-0 truncate" title={f.path}>{f.path}</span>
                                            <FileActionMenu
                                              fileId={f.id}
                                              fileName={f.path.split(/[/\\]/).pop()}
                                              status="active"
                                              hasArchiveRoot={!!archiveInfo?.archiveRoot}
                                              onArchived={() => {
                                                setLoading(true);
                                                ipc.getDuplicateGroups().then(setGroups).catch(() => {});
                                                ipc.getArchiveInfo().then((v) => setArchiveInfo(v ?? null)).catch(() => {});
                                                setLoading(false);
                                              }}
                                            />
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
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
