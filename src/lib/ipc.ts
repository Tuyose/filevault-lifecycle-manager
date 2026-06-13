import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type {
  AnalyticsSnapshot,
  AppStatus,
  ArchiveAck,
  ArchiveInfo,
  ArchiveResult,
  DatabaseStatus,
  DuplicateGroup,
  HealthBreakdown,
  RestoreResult,
  ScanJob,
  SchedulerStatus,
  TrashResult,
  RestoreTrashResult,
  TrashStats,
  RetentionSettings,
  RetentionSummary,
  PurgeResult,
  PurgeBatchResult,
  ScanPreview,
  ScanRun,
  ScanStats,
  ScanSummary,
  TrashAck,
  WatchFolder,
} from "../types/ipc";

export const ipc = {
  getAppStatus: () => invoke<AppStatus>("get_app_status"),
  getDatabaseStatus: () => invoke<DatabaseStatus>("get_database_status"),
  scanFolderPreview: (path: string) =>
    invoke<ScanPreview>("scan_folder_preview", { path }),
  scanFolder: (path: string) => invoke<ScanSummary>("scan_folder", { path }),
  getScanStats: () => invoke<ScanStats>("get_scan_stats"),
  getScanHistory: () => invoke<ScanRun[]>("get_scan_history"),
  getDuplicateGroups: () => invoke<DuplicateGroup[]>("get_duplicate_groups"),
  pauseScan: () => invoke<void>("pause_scan"),
  resumeScan: () => invoke<void>("resume_scan"),
  cancelScan: () => invoke<void>("cancel_scan"),
  archivePlaceholder: (fileId: string) =>
    invoke<ArchiveAck>("archive_placeholder", { fileId }),
  trashPlaceholder: (fileId: string) =>
    invoke<TrashAck>("trash_placeholder", { fileId }),
  // Watch folders
  listWatchFolders: () => invoke<WatchFolder[]>("list_watch_folders"),
  addWatchFolder: (args: { path: string; label: string; frequency: string; preferredWeekday?: number; preferredHour: number; preferredMinute: number }) =>
    invoke<WatchFolder>("add_watch_folder", args),
  updateWatchFolder: (args: { id: string; label: string; frequency: string; preferredWeekday?: number; preferredHour: number; preferredMinute: number }) =>
    invoke<WatchFolder>("update_watch_folder", args),
  deleteWatchFolder: (id: string) =>
    invoke<void>("delete_watch_folder", { id }),
  toggleWatchFolder: (id: string, enabled: boolean) =>
    invoke<WatchFolder>("toggle_watch_folder", { id, enabled }),
  runWatchFolderScan: (id: string) =>
    invoke<void>("run_watch_folder_scan", { id }),
  getSchedulerStatus: () => invoke<SchedulerStatus>("get_scheduler_status"),
  // Analytics
  getDashboardAnalytics: () => invoke<AnalyticsSnapshot[]>("get_dashboard_analytics"),
  getHealthBreakdown: () => invoke<HealthBreakdown>("get_health_breakdown"),
  getScanTrends: () => invoke<AnalyticsSnapshot[]>("get_scan_trends"),
  getActiveScanJob: () => invoke<ScanJob | null>("get_active_scan_job"),
  startScanJob: (args: { path: string; source: string; watch_folder_id?: string }) => invoke<ScanJob>("start_scan_job", { args }),
  // Archive
  getArchiveRoot: () => invoke<string | null>("get_archive_root"),
  setArchiveRoot: (path: string) => invoke<void>("set_archive_root", { path }),
  clearArchiveRoot: () => invoke<void>("clear_archive_root"),
  archiveFile: (fileId: string) => invoke<ArchiveResult>("archive_file", { fileId }),
  restoreFile: (fileId: string, conflictStrategy = "rename") => invoke<RestoreResult>("restore_file", { fileId, conflictStrategy }),
  listArchivedFiles: () => invoke<any[]>("list_archived_files"),
  getArchiveInfo: () => invoke<ArchiveInfo>("get_archive_info"),
  // File actions
  listActiveFiles: () => invoke<any[]>("list_active_files"),
  revealFileInExplorer: (fileId: string) => invoke<void>("reveal_file_in_explorer", { fileId }),
  openContainingFolder: (fileId: string) => invoke<void>("open_containing_folder", { fileId }),
  getFileCurrentPath: (fileId: string) => invoke<string>("get_file_current_path", { fileId }),
  // Trash
  moveFileToTrash: (fileId: string) => invoke<TrashResult>("move_file_to_trash", { fileId }),
  restoreFileFromTrash: (fileId: string, conflictStrategy = "rename") => invoke<RestoreTrashResult>("restore_file_from_trash", { fileId, conflictStrategy }),
  listTrashedFiles: () => invoke<any[]>("list_trashed_files"),
  getTrashStats: () => invoke<TrashStats>("get_trash_stats"),
  // Retention
  getRetentionSettings: () => invoke<RetentionSettings>("get_retention_settings"),
  updateRetentionSettings: (retentionDays: number, autoPurgeEnabled: boolean) => invoke<RetentionSettings>("update_retention_settings", { retentionDays, autoPurgeEnabled }),
  getRetentionSummary: () => invoke<RetentionSummary>("get_retention_summary"),
  listPurgeCandidates: () => invoke<any[]>("list_purge_candidates"),
  purgeTrashedFile: (fileId: string) => invoke<PurgeResult>("purge_trashed_file", { fileId }),
  purgeEligibleFiles: () => invoke<PurgeBatchResult>("purge_eligible_files"),
};

export const dialogs = {
  pickFolder: async (): Promise<string | null> => {
    const selection = await open({
      directory: true,
      multiple: false,
      title: "Select a folder to scan",
    });
    if (selection === null) return null;
    if (Array.isArray(selection)) return selection[0] ?? null;
    return selection;
  },
};
