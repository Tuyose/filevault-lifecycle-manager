export type AppStatus = {
  name: string;
  version: string;
  ready: boolean;
};

export type DatabaseStatus = {
  healthy: boolean;
  path: string;
};

export type ScanPreview = {
  requested_path: string;
  would_scan: boolean;
};

export type ArchiveAck = {
  accepted: boolean;
};

export type TrashAck = {
  accepted: boolean;
};

export type ScanErrorItem = {
  path: string;
  message: string;
};

export type ScanSummary = {
  root: string;
  total_seen: number;
  inserted: number;
  updated: number;
  errors: number;
  total_bytes: number;
  started_at: string;
  finished_at: string;
  error_samples: ScanErrorItem[];
};

export type ScanStats = {
  total: number;
  total_bytes: number;
  active: number;
  archived: number;
  trashed: number;
  deleted: number;
};

export type ScanProgress = {
  processed: number;
  total_files: number;
  current_path: string;
  current_dir: string;
  phase: "Counting" | "Scanning" | "Done";
};

export type ScanRun = {
  id: string;
  root_path: string;
  started_at: string;
  finished_at: string;
  total_seen: number;
  inserted: number;
  updated: number;
  errors: number;
  total_bytes: number;
  status: "completed" | "cancelled" | "error";
};

export type DuplicateFile = {
  id: string;
  path: string;
  size_bytes: number;
  modified_at: string | null;
};

export type DuplicateGroup = {
  hash: string;
  total_files: number;
  total_wasted_bytes: number;
  files: DuplicateFile[];
};

export type WatchFolder = {
  id: string;
  path: string;
  label: string;
  enabled: boolean;
  frequency: "daily" | "weekly" | "monthly";
  preferred_weekday?: number;
  preferred_hour: number;
  preferred_minute: number;
  last_scan_at?: string;
  next_scan_at?: string;
};

export type SchedulerStatus = {
  idle: boolean;
  scanning: boolean;
  next_scan_label: string;
};

export type ScanJob = {
  id: string;
  path: string;
  source: "manual" | "watch-folder" | "scheduled";
  watch_folder_id?: string;
  status: "idle" | "counting" | "scanning" | "paused" | "cancelled" | "completed" | "error";
  started_at?: string;
  finished_at?: string;
  processed: number;
  total_files: number;
  current_path?: string;
  current_dir?: string;
  error_message?: string;
};

export type AnalyticsSnapshot = {
  id: string;
  created_at: string;
  tracked_files: number;
  total_size_bytes: number;
  duplicate_groups: number;
  duplicate_files: number;
  reclaimable_bytes: number;
  health_score: number;
};

export type HealthBreakdown = {
  overall: number;
  duplicateDensity: number;
  storageEfficiency: number;
  reclaimableRisk: number;
  tips: string[];
};
