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
