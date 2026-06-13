import { useEffect, useState } from "react";

import { StatCard } from "../../components/ui/StatCard";
import { ipc } from "../../lib/ipc";
import type { AppStatus, DatabaseStatus } from "../../types/ipc";

type Status =
  | { kind: "loading" }
  | { kind: "ready"; app: AppStatus; db: DatabaseStatus }
  | { kind: "error"; message: string };

/**
 * Dashboard: first screen after launch. Confirms the React → Rust IPC
 * link is healthy and surfaces the core counters that real widgets
 * will eventually consume.
 */
export function DashboardPage() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [app, db] = await Promise.all([
          ipc.getAppStatus(),
          ipc.getDatabaseStatus(),
        ]);
        if (!cancelled) setStatus({ kind: "ready", app, db });
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

      <div className="rounded-xl border border-vault-border bg-vault-surface p-6 text-sm text-slate-300">
        Feature widgets (recent archives, trash count, duplicate groups)
        will mount here once the corresponding services are wired up.
      </div>
    </section>
  );
}
