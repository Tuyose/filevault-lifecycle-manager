import type { DuplicateGroup } from "../types/ipc";

// ── Types ────────────────────────────────────────────────────────

export type FolderInsight = {
  path: string;
  total_bytes: number;
  duplicate_bytes: number;
  duplicate_groups: number;
  duplicate_files: number;
  group_count: number;
};

export type FolderSize = {
  path: string;
  total_bytes: number;
};

// ── Helpers ──────────────────────────────────────────────────────

/** Extract the parent folder from a file path. Normalises backslashes. */
export function parentFolder(filePath: string): string {
  // Normalise to forward-slash, then take everything before the last /
  const norm = filePath.replace(/\\/g, "/");
  const lastSlash = norm.lastIndexOf("/");
  if (lastSlash <= 0) return "/";
  return norm.slice(0, lastSlash);
}

/** Shorten a path for display: keep last N segments. */
export function shortenPath(path: string, segments = 2): string {
  const norm = path.replace(/\\/g, "/");
  const parts = norm.split("/").filter(Boolean);
  if (parts.length <= segments) return norm;
  return "…/" + parts.slice(-segments).join("/");
}

/**
 * Aggregate duplicate files by their parent folder.
 * Returns a map of folder path → FolderInsight.
 */
export function groupByFolder(
  groups: DuplicateGroup[],
): Map<string, FolderInsight> {
  const map = new Map<string, FolderInsight>();

  for (const group of groups) {
    for (const file of group.files) {
      const folder = parentFolder(file.path);
      let insight = map.get(folder);
      if (!insight) {
        insight = {
          path: folder,
          total_bytes: 0,
          duplicate_bytes: 0,
          duplicate_groups: 0,
          duplicate_files: 0,
          group_count: 0,
        };
        map.set(folder, insight);
      }
      insight.total_bytes += file.size_bytes;
      insight.duplicate_files += 1;
    }
  }

  // Calculate per-folder unique groups + reclaimable
  const groupFolders = new Map<string, Set<string>>();
  for (const group of groups) {
    for (const file of group.files) {
      const folder = parentFolder(file.path);
      if (!groupFolders.has(folder)) groupFolders.set(folder, new Set());
      groupFolders.get(folder)!.add(group.hash);
    }
  }
  for (const [folder, hashes] of groupFolders) {
    const insight = map.get(folder);
    if (insight) insight.duplicate_groups = hashes.size;
  }

  // Reclaimable: for each group's files in this folder, the excess
  for (const group of groups) {
    const filesInFolder = group.files.filter((f) =>
      map.has(parentFolder(f.path)),
    );
    if (filesInFolder.length < 2) continue;
    const folder = parentFolder(filesInFolder[0].path);
    const insight = map.get(folder);
    if (!insight) continue;
    // Reclaimable = total - 1 copy (the one we'd keep)
    const keep = Math.min(...filesInFolder.map((f) => f.size_bytes));
    const wasted = filesInFolder.reduce((s, f) => s + f.size_bytes, 0) - keep;
    insight.duplicate_bytes += wasted;
  }

  return map;
}

/**
 * Build top N folders by total duplicate bytes.
 */
export function topDuplicateFolders(
  groups: DuplicateGroup[],
  limit = 10,
): FolderInsight[] {
  const byFolder = groupByFolder(groups);
  return Array.from(byFolder.values())
    .sort((a, b) => b.duplicate_bytes - a.duplicate_bytes)
    .slice(0, limit);
}

/**
 * Build top N folders by total file size (from duplicate groups).
 * Since we don't have total file listing, we use duplicate totals as proxy.
 */
export function topFoldersBySize(
  groups: DuplicateGroup[],
  limit = 10,
): FolderSize[] {
  const byFolder = groupByFolder(groups);
  return Array.from(byFolder.values())
    .sort((a, b) => b.total_bytes - a.total_bytes)
    .slice(0, limit)
    .map((f) => ({ path: f.path, total_bytes: f.total_bytes }));
}

/**
 * Group duplicate groups by their most common parent folder.
 * Returns a Map<folder, DuplicateGroup[]>.
 */
export function groupGroupsByFolder(
  groups: DuplicateGroup[],
): Map<string, DuplicateGroup[]> {
  const map = new Map<string, DuplicateGroup[]>();

  for (const group of groups) {
    // Determine the "home" folder as the parent of the first file
    const firstFile = group.files[0];
    if (!firstFile) continue;
    const folder = parentFolder(firstFile.path);

    const existing = map.get(folder);
    if (existing) {
      existing.push(group);
    } else {
      map.set(folder, [group]);
    }
  }

  return map;
}

/** Format bytes to human-readable string. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const power = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / Math.pow(1024, power);
  return `${value.toFixed(power === 0 ? 0 : 1)} ${units[power]}`;
}

/** Guess file category from extension. */
export function fileCategory(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const imageExts = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "tiff"]);
  const videoExts = new Set(["mp4", "avi", "mkv", "mov", "wmv", "flv", "webm"]);
  const archiveExts = new Set(["zip", "tar", "gz", "bz2", "7z", "rar", "xz"]);
  const apkExts = new Set(["apk", "aab"]);
  if (imageExts.has(ext)) return "Images";
  if (videoExts.has(ext)) return "Videos";
  if (archiveExts.has(ext)) return "Archives";
  if (apkExts.has(ext)) return "APK";
  return "Other";
}

/** Format a duration ISO string pair. */
export function formatDuration(startedAt: string, finishedAt: string): string {
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  const ms = Math.max(0, end - start);
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** Format an ISO timestamp to human-readable. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
