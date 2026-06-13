import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type {
  AppStatus,
  ArchiveAck,
  DatabaseStatus,
  DuplicateGroup,
  SchedulerStatus,
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
