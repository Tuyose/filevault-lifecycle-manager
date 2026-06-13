import type { DuplicateGroup, ScanRun } from "../types/ipc";
import { fileCategory, formatBytes } from "./folder-insights";

// ── Types ────────────────────────────────────────────────────────

export type Severity = "low" | "medium" | "high";
export type Category = "duplicate" | "inactive" | "downloads" | "large_files" | "cleanup";

export type Recommendation = {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  reclaimableBytes?: number;
  affectedFiles?: number;
  category: Category;
  /** Optional target route the user should go to. */
  navigateTo?: string;
  /** Optional filter payload for the target page. */
  filterPayload?: string;
};

// ── Helpers ──────────────────────────────────────────────────────

/** Group duplicate files by category and return structured data per category. */
function categorizeDuplicates(groups: DuplicateGroup[]) {
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

/** Find scan runs whose root path contains "Downloads". */
function downloadsRuns(history: ScanRun[]): ScanRun[] {
  return history.filter((r) =>
    r.root_path.toLowerCase().includes("downloads") ||
    r.root_path.toLowerCase().includes("indir"),
  );
}

/** Estimate days since last scan of Downloads. */
function daysSinceLastScan(run: ScanRun | undefined): number | null {
  if (!run) return null;
  const finished = new Date(run.finished_at).getTime();
  return Math.floor((Date.now() - finished) / (1000 * 60 * 60 * 24));
}

// ── Engine ───────────────────────────────────────────────────────

/**
 * Pure function — given the same inputs it produces the same
 * recommendations. No AI, no state, no side effects.
 *
 * Ordering: high severity first, then by reclaimable bytes desc.
 */
export function generateRecommendations(
  groups: DuplicateGroup[],
  history: ScanRun[],
): Recommendation[] {
  const recs: Recommendation[] = [];
  let id = 0;

  // ── 1. Duplicate category recommendations ──
  const categories = categorizeDuplicates(groups);

  for (const cat of categories) {
    const severity: Severity = cat.bytes > 500_000_000 ? "high" : cat.bytes > 50_000_000 ? "medium" : "low";
    recs.push({
      id: `rec-${id++}`,
      title: `Review duplicate ${cat.category.toLowerCase()} files`,
      description: `${cat.count} duplicate groups · ${formatBytes(cat.bytes)} reclaimable`,
      severity,
      reclaimableBytes: cat.bytes,
      affectedFiles: cat.files,
      category: "duplicate",
      navigateTo: "/duplicates",
      filterPayload: cat.category,
    });
  }

  // ── 2. Downloads intelligence ──
  const dls = downloadsRuns(history);
  const lastDl = dls[0];
  const dlDays = daysSinceLastScan(lastDl);

  if (lastDl && dlDays !== null && dlDays > 7) {
    recs.push({
      id: `rec-${id++}`,
      title: "Downloads folder needs attention",
      description:
        dlDays > 30
          ? `Not scanned in ${dlDays} days · ${formatBytes(lastDl.total_bytes)} last seen`
          : `Not scanned in ${dlDays} days`,
      severity: dlDays > 30 ? "high" : dlDays > 14 ? "medium" : "low",
      reclaimableBytes: lastDl.total_bytes,
      affectedFiles: lastDl.total_seen,
      category: "downloads",
      navigateTo: "/scanner",
    });
  }

  // ── 3. Large duplicate hotspots ──
  if (groups.length > 0) {
    const biggestGroup = groups.reduce((a, b) =>
      a.total_wasted_bytes > b.total_wasted_bytes ? a : b,
    );
    if (biggestGroup.total_wasted_bytes > 100_000_000) {
      const sampleName = biggestGroup.files[0]?.path.split(/[/\\]/).pop() ?? "files";
      recs.push({
        id: `rec-${id++}`,
        title: `Large duplicate: ${sampleName}`,
        description: `${formatBytes(biggestGroup.total_wasted_bytes)} reclaimable · ${biggestGroup.total_files} copies`,
        severity: biggestGroup.total_wasted_bytes > 500_000_000 ? "high" : "medium",
        reclaimableBytes: biggestGroup.total_wasted_bytes,
        affectedFiles: biggestGroup.total_files,
        category: "large_files",
        navigateTo: "/duplicates",
      });
    }
  }

  // ── 4. Cleanup: many small duplicate groups ──
  const smallGroups = groups.filter((g) => g.total_wasted_bytes < 1_000_000);
  if (smallGroups.length > 20) {
    recs.push({
      id: `rec-${id++}`,
      title: `${smallGroups.length} small duplicate groups to clean`,
      description: `Each under 1 MB · total ${formatBytes(smallGroups.reduce((s, g) => s + g.total_wasted_bytes, 0))}`,
      severity: smallGroups.length > 50 ? "medium" : "low",
      category: "cleanup",
      navigateTo: "/duplicates",
    });
  }

  // Sort: high first, then by reclaimableBytes desc
  const severityOrder = { high: 0, medium: 1, low: 2 };
  return recs.sort((a, b) => {
    const sa = severityOrder[a.severity];
    const sb = severityOrder[b.severity];
    if (sa !== sb) return sa - sb;
    return (b.reclaimableBytes ?? 0) - (a.reclaimableBytes ?? 0);
  });
}

// ── Health score computation ──

export type HealthBreakdown = {
  label: string;
  score: number; // 0–100
};

export function computeHealthScore(
  groups: DuplicateGroup[],
  totalFiles: number,
): { score: number; breakdown: HealthBreakdown[] } {
  if (totalFiles === 0) return { score: 100, breakdown: [] };

  const breakdown: HealthBreakdown[] = [];

  // Duplicate density
  const dupFiles = groups.reduce((s, g) => s + g.total_files, 0);
  const dupRatio = dupFiles / Math.max(totalFiles, 1);
  const dupScore = Math.max(0, Math.round(100 - dupRatio * 50));
  breakdown.push({ label: "Duplicates", score: dupScore });

  // Storage efficiency
  const wasted = groups.reduce((s, g) => s + g.total_wasted_bytes, 0);
  // Estimate total storage as active files * average size
  // (approximate, since we only have wasted bytes from groups)
  const storageScore = wasted > 1_000_000_000 ? 60 : wasted > 100_000_000 ? 75 : 90;
  breakdown.push({ label: "Storage efficiency", score: storageScore });

  // Average
  const avgScore = Math.round(breakdown.reduce((s, b) => s + b.score, 0) / breakdown.length);
  return { score: avgScore, breakdown };
}

// ── Insights generation ──

export type Insight = {
  icon: string;
  text: string;
  timestamp: Date;
};

export function generateInsights(
  groups: DuplicateGroup[],
  history: ScanRun[],
): Insight[] {
  const insights: Insight[] = [];
  const now = new Date();

  if (groups.length > 0) {
    const byCat = categorizeDuplicates(groups);
    for (const cat of byCat.slice(0, 3)) {
      insights.push({
        icon: cat.category === "APK" ? "📦" : cat.category === "Images" ? "🖼" : cat.category === "Videos" ? "🎬" : cat.category === "Archives" ? "🗜" : "📄",
        text: `You have ${cat.count} duplicate ${cat.category.toLowerCase()} groups (${formatBytes(cat.bytes)})`,
        timestamp: now,
      });
    }
  }

  if (history.length > 0) {
    const last = history[0];
    insights.push({
      icon: "📊",
      text: `Last scan: ${last.total_seen} files in "${last.root_path.split(/[/\\]/).pop()}"`,
      timestamp: new Date(last.finished_at),
    });
  }

  const dls = downloadsRuns(history);
  const dlDays = daysSinceLastScan(dls[0]);
  if (dlDays !== null && dlDays > 7) {
    insights.push({
      icon: "⬇",
      text: `Downloads has not been scanned in ${dlDays} days`,
      timestamp: now,
    });
  }

  // Sort by timestamp descending (newest first)
  insights.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return insights;
}
