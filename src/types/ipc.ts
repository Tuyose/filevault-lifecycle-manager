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
