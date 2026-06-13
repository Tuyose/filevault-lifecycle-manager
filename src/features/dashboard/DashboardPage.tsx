import { useEffect, useState } from "react";

import { StatCard } from "../../components/ui/StatCard";
import { ipc } from "../../lib/ipc";
import type {
  AppStatus,
  DatabaseStatus,
  ScanStats,
} from "../../types/ipc";

type Status =
  | { kind: "loading" }
  | {
      kind: "ready";
      app: AppStatus;
      db: DatabaseStatus;
      stats: ScanStats | null;
    }
  | { kind: "error"; message: string };

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const power = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / Math.pow(1024, power);
  return `${value.toFixed(power === 0 ? 0 : 1)} ${units[power]}`;
}

export function DashboardPage() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [app, db, stats] = await Promise.all([
          ipc.getAppStatus(),
          ipc.getDatabaseStatus(),
          ipc
            .getScanStats()
            .catch(() => null),
        ]);
        if (!cancelled) setStatus({ kind: "ready", app, db, stats });
      } catch (err) {
        if (!cancelled) {
          setStatus({
            kind: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (status.kind === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-vault-muted">
        Connecting to FileVault core…
      </div>
    );
  }

  if (status.kind === "error") {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-rose-700/40 bg-rose-950/30 p-4 text-sm text-rose-200">
          Failed to reach the Rust side: {status.message}
        </div>
      </div>
    );
  }

  return (
    <section className="flex h-full flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold text-slate-100">Dashboard</h1>
        <p className="mt-1 text-sm text-vault-muted">
          Live snapshot of the local FileVault core. All counts come from
          the SQLite database; nothing leaves this machine.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          label="Application"
          value={status.app.name}
          hint={`v${status.app.version}`}
        />
        <StatCard
          label="Database"
          value={status.db.healthy ? "healthy" : "unreachable"}
          hint={status.db.path}
          tone={status.db.healthy ? "ok" : "warn"}
        />
        <StatCard
          label="IPC bridge"
          value="ready"
          hint="Frontend ↔ Rust"
          tone="ok"
        />
      </div>

      {status.stats && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <StatCard
            label="Tracked files"
            value={status.stats.total.toString()}
            hint={formatBytes(status.stats.total_bytes)}
          />
          <StatCard
            label="Active"
            value={status.stats.active.toString()}
            tone="ok"
          />
          <StatCard label="Archived" value={status.stats.archived.toString()} />
          <StatCard label="Trashed" value={status.stats.trashed.toString()} />
          <StatCard label="Deleted" value={status.stats.deleted.toString()} />
        </div>
      )}

      <div className="rounded-xl border border-vault-border bg-vault-surface p-6 text-sm text-slate-300">
        Tip: head to the <span className="text-vault-accent">Scanner</span> tab
        to index a folder for the first time.
      </div>
    </section>
  );
}
