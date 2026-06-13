import { invoke } from "@tauri-apps/api/core";

import type {
  AppStatus,
  ArchiveAck,
  DatabaseStatus,
  ScanPreview,
  TrashAck,
} from "../types/ipc";

export const ipc = {
  getAppStatus: () => invoke<AppStatus>("get_app_status"),
  getDatabaseStatus: () => invoke<DatabaseStatus>("get_database_status"),
  scanFolderPreview: (path: string) =>
    invoke<ScanPreview>("scan_folder_preview", { path }),
  archivePlaceholder: (fileId: string) =>
    invoke<ArchiveAck>("archive_placeholder", { fileId }),
  trashPlaceholder: (fileId: string) =>
    invoke<TrashAck>("trash_placeholder", { fileId }),
};
