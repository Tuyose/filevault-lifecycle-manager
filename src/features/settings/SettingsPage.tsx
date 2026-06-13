import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { dialogs, ipc } from "../../lib/ipc";
import type { WatchFolder } from "../../types/ipc";
import { formatTime } from "../../lib/folder-insights";

const DEFAULT_SUGGESTIONS = [
  { label: "Downloads", path: "%USERPROFILE%\\Downloads" },
  { label: "Desktop", path: "%USERPROFILE%\\Desktop" },
  { label: "Documents", path: "%USERPROFILE%\\Documents" },
];

const FREQ_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

export function SettingsPage() {
  const navigate = useNavigate();
  const [folders, setFolders] = useState<WatchFolder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    ipc.listWatchFolders()
      .then(setFolders)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  async function handleAdd(path: string, label: string) {
    await ipc.addWatchFolder({ path, label, frequency: "weekly", preferredWeekday: 6, preferredHour: 20, preferredMinute: 0 });
    load();
  }

  async function handleToggle(id: string, enabled: boolean) {
    await ipc.toggleWatchFolder(id, enabled);
    load();
  }

  async function handleDelete(id: string) {
    await ipc.deleteWatchFolder(id);
    load();
  }

  async function handleRunNow(wf: WatchFolder) {
    // Navigate to Files page with scan intent — the scanner will auto-start
    navigate("/scanner", {
      state: {
        scanIntent: {
          source: "watch-folder",
          watchFolderId: wf.id,
          path: wf.path,
          autoStart: true,
        },
      },
    });
    // Also run the backend scan-side update
    ipc.runWatchFolderScan(wf.id).catch(() => {});
    load();
  }

  async function handlePickAdd() {
    const picked = await dialogs.pickFolder();
    if (!picked) return;
    const name = picked.split(/[/\\]/).pop() || "Folder";
    await handleAdd(picked, name);
  }

  return (
    <div className="flex h-full flex-col gap-8 overflow-y-auto p-8 animate-fade-in">
      <header>
        <h1 className="text-2xl font-semibold text-slate-100">Settings</h1>
        <p className="mt-1 text-sm text-vault-muted">Configure watch folders, scheduling, and cleanup rules.</p>
      </header>

      {/* ── Watch Folders ── */}
      <Section title="Watch Folders" subtitle="Folders that are automatically scanned on a schedule">
        {loading ? (
          <div className="text-sm text-vault-muted">Loading…</div>
        ) : folders.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-vault-border p-6 text-center text-sm text-vault-muted">
            No watch folders configured yet.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {folders.map((wf) => (
              <div
                key={wf.id}
                className="rounded-[14px] border border-vault-border bg-vault-surface p-4 transition-all duration-[180ms] hover:border-vault-border/80"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-100">{wf.label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        wf.enabled ? "bg-emerald-500/10 text-emerald-300" : "bg-vault-bg text-vault-muted"
                      }`}>
                        {wf.enabled ? "Active" : "Paused"}
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-xs text-vault-muted/70" title={wf.path}>
                      {wf.path.length > 60 ? `${wf.path.slice(0, 55)}…` : wf.path}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-vault-muted/60">
                      <span>{FREQ_LABELS[wf.frequency] ?? wf.frequency}</span>
                      {wf.last_scan_at && <span>Last: {formatTime(wf.last_scan_at)}</span>}
                      {wf.next_scan_at && <span>Next: {formatTime(wf.next_scan_at)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggle(wf.id, !wf.enabled)}
                      className={`rounded-[10px] px-2.5 py-1.5 text-xs transition-all ${
                        wf.enabled
                          ? "bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                          : "bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                      }`}
                    >
                      {wf.enabled ? "Pause" : "Activate"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRunNow(wf)}
                      className="rounded-[10px] bg-vault-accent/10 px-2.5 py-1.5 text-xs text-vault-accent hover:bg-vault-accent/20"
                    >
                      Run now
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(wf.id)}
                      className="rounded-[10px] bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add new */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handlePickAdd}
            className="rounded-[10px] border border-vault-accent/30 bg-vault-accent/8 px-4 py-2 text-sm text-vault-accent transition-all duration-[120ms] hover:bg-vault-accent/15"
          >
            + Add folder
          </button>

          {folders.length === 0 && DEFAULT_SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => handleAdd(s.path, s.label)}
              className="rounded-[10px] border border-vault-border bg-vault-surface/50 px-3 py-1.5 text-xs text-vault-muted hover:text-slate-200 transition-colors"
            >
              + {s.label}
            </button>
          ))}
        </div>
      </Section>

      {/* ── Scheduling ── */}
      <Section title="Scheduling" subtitle="How often watch folders are scanned">
        <div className="rounded-[14px] border border-vault-border bg-vault-surface p-5 text-sm text-vault-muted">
          <p>Scheduled scans run while the app is open. The scheduler checks for due scans every 60 seconds.</p>
          <p className="mt-2">Frequency options for each folder: <strong className="text-slate-200">Daily</strong> (preferred time), <strong className="text-slate-200">Weekly</strong> (preferred day + time), <strong className="text-slate-200">Monthly</strong> (preferred day + time).</p>
        </div>
      </Section>

      {/* ── Smart Cleanup Rules ── */}
      <Section title="Smart Cleanup Rules" subtitle="Thresholds for recommendations">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-[14px] border border-vault-border bg-vault-surface p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-vault-muted/70">Inactive threshold</div>
            <div className="mt-2 text-sm text-slate-200">30 days (default)</div>
          </div>
          <div className="rounded-[14px] border border-vault-border bg-vault-surface p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-vault-muted/70">Large file threshold</div>
            <div className="mt-2 text-sm text-slate-200">500 MB (default)</div>
          </div>
          <div className="rounded-[14px] border border-vault-border bg-vault-surface p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-vault-muted/70">Downloads monitoring</div>
            <div className="mt-2 text-sm text-slate-200">Enabled (default)</div>
          </div>
        </div>
      </Section>

      {/* ── Performance ── */}
      <Section title="Performance" subtitle="Resource usage">
        <div className="rounded-[14px] border border-vault-border bg-vault-surface p-5 text-sm text-vault-muted">
          <p>Max concurrent hash operations: <strong className="text-slate-200">4</strong></p>
          <p className="mt-1">Database: SQLite · WAL mode</p>
        </div>
      </Section>

      {/* ── Privacy ── */}
      <Section title="Privacy" subtitle="Your data stays on your machine">
        <div className="rounded-[14px] border border-vault-border bg-vault-surface p-5 text-sm text-vault-muted">
          <p>✓ All processing is local</p>
          <p className="mt-1">✓ No telemetry</p>
          <p className="mt-1">✓ No cloud sync</p>
          <p className="mt-1">✓ Database stored at: <code className="font-mono text-xs text-slate-300">%APPDATA%/com.filevault.lifecycle/</code></p>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-slate-200">{title}</h2>
        {subtitle && <span className="text-xs text-vault-muted/50">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}
