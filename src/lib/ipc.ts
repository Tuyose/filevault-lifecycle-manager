import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type {
  AppStatus,
  ArchiveAck,
  DatabaseStatus,
  ScanPreview,
  ScanRun,
  ScanStats,
  ScanSummary,
  TrashAck,
} from "../types/ipc";

export const ipc = {
  getAppStatus: () => invoke<AppStatus>("get_app_status"),
  getDatabaseStatus: () => invoke<DatabaseStatus>("get_database_status"),
  scanFolderPreview: (path: string) =>
    invoke<ScanPreview>("scan_folder_preview", { path }),
  scanFolder: (path: string) => invoke<ScanSummary>("scan_folder", { path }),
  getScanStats: () => invoke<ScanStats>("get_scan_stats"),
  getScanHistory: () => invoke<ScanRun[]>("get_scan_history"),
  pauseScan: () => invoke<void>("pause_scan"),
  resumeScan: () => invoke<void>("resume_scan"),
  cancelScan: () => invoke<void>("cancel_scan"),
  archivePlaceholder: (fileId: string) =>
    invoke<ArchiveAck>("archive_placeholder", { fileId }),
  trashPlaceholder: (fileId: string) =>
    invoke<TrashAck>("trash_placeholder", { fileId }),
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
