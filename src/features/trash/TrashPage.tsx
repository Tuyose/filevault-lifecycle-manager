import { useEffect, useState } from "react";
import { Trash2, RotateCcw, FileText, AlertTriangle } from "lucide-react";

import { ipc } from "../../lib/ipc";
import type { RetentionSummary, TrashStats } from "../../types/ipc";
import { formatBytes, formatTime } from "../../lib/folder-insights";
import { PageShell } from "../../components/layout/PageShell";
import { FileActionMenu } from "../../components/file-actions/FileActionMenu";

export function TrashPage() {
  const [stats, setStats] = useState<TrashStats | null>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [retention, setRetention] = useState<RetentionSummary | null>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [purgingId, setPurgingId] = useState<string | null>(null);
  const [batchPurging, setBatchPurging] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, flist, r, c] = await Promise.all([
        ipc.getTrashStats(),
        ipc.listTrashedFiles().catch(() => [] as any[]),
        ipc.getRetentionSummary().catch(() => null),
        ipc.listPurgeCandidates().catch(() => [] as any[]),
      ]);
      setStats(s);
      setFiles(flist ?? []);
      if (r) setRetention(r);
      setCandidates(c ?? []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  async function handleRestore(fileId: string) {
    setRestoringId(fileId);
    try { await ipc.restoreFileFromTrash(fileId); await load(); }
    catch {} finally { setRestoringId(null); }
  }

  async function handlePurge(fileId: string) {
    setPurgingId(fileId);
    try { await ipc.purgeTrashedFile(fileId); await load(); }
    catch {} finally { setPurgingId(null); }
  }

  async function handleBatchPurge() {
    setBatchPurging(true);
    try { await ipc.purgeEligibleFiles(); await load(); }
    catch {} finally { setBatchPurging(false); }
  }

  if (loading) {
    return (
      <PageShell title="Trash" subtitle="Soft-deleted files">
        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }} />
          ))}
        </div>
      </PageShell>
    );
  }

  const isCandidate = (fileId: string) => candidates.some((c) => c.id === fileId);

  return (
    <PageShell title="Trash" subtitle="Soft-deleted files">
      <div className="flex flex-col gap-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <StatBlock label="Trashed files" value={(stats?.trashedFiles ?? 0).toString()} />
          <StatBlock label="Size" value={formatBytes(stats?.trashedSizeBytes ?? 0)} />
          <StatBlock label="Retention" value={`${retention?.retentionDays ?? 30}d`} valueColor="#F59E0B" />
        </div>

        {/* Retention notice */}
        {retention && (
          <div className="rounded-xl p-4 text-xs"
            style={{ background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.1)", color: "#6EE7B7" }}>
            {retention.retentionDays}-day retention · Auto purge off · {retention.purgeEligibleFiles} files eligible ({formatBytes(retention.purgeEligibleBytes)})
          </div>
        )}

        {/* Purge Candidates */}
        {candidates.length > 0 && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: "#F59E0B" }}>
                Eligible for permanent deletion ({candidates.length})
              </h3>
              <button onClick={() => { if (confirm(`Permanently delete ${candidates.length} eligible trash files? This cannot be undone.`)) handleBatchPurge(); }}
                disabled={batchPurging}
                className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 disabled:opacity-40"
                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#F87171" }}>
                <AlertTriangle size={11} className="inline mr-1" />
                {batchPurging ? "Purging…" : "Purge eligible"}
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {candidates.map((f: any) => (
                <div key={f.id} className="flex items-center gap-3 rounded-lg px-4 py-3"
                  style={{ background: "rgba(245,158,11,0.03)", border: "1px solid rgba(245,158,11,0.08)" }}>
                  <FileText size={14} color="#F59E0B" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate" style={{ color: "#EDEDFD" }}>{f.file_name}</div>
                    <div className="mt-0.5 text-xs truncate" style={{ color: "#6060A0" }} title={f.current_path}>{f.current_path?.length > 60 ? f.current_path.slice(0, 57) + "…" : f.current_path}</div>
                  </div>
                  <div className="shrink-0 text-xs" style={{ color: "#F59E0B" }}>
                    {f.trashed_at ? `${Math.floor((Date.now() - new Date(f.trashed_at).getTime()) / 86400000)}d ago` : ""}
                  </div>
                  <div className="shrink-0 text-right text-xs" style={{ color: "#6060A0" }}>{formatBytes(f.size_bytes)}</div>
                  <button onClick={() => handleRestore(f.id)} disabled={restoringId === f.id}
                    className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-all hover:bg-white/5 disabled:opacity-40"
                    style={{ color: "#6EE7B7" }}>
                    <RotateCcw size={11} /> Restore
                  </button>
                  <button onClick={() => { if (confirm(`Permanently delete ${f.file_name}? This cannot be undone.`)) handlePurge(f.id); }}
                    disabled={purgingId === f.id}
                    className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-all hover:bg-white/5 disabled:opacity-40"
                    style={{ color: "#F87171" }}>
                    <Trash2 size={11} /> Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All trashed files */}
        <div>
          <h3 className="mb-3 text-sm font-semibold" style={{ color: "#EDEDFD" }}>All Trashed Files ({files.length})</h3>
          {files.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-xl p-10 text-center"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(100,100,220,0.06)" }}>
              <Trash2 size={24} style={{ color: "#6060A0", opacity: 0.3 }} />
              <p style={{ fontSize: 13, color: "#6060A0", maxWidth: 320 }}>Trash is empty.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {files.map((f: any) => (
                <div key={f.id} className="flex items-center gap-3 rounded-lg px-4 py-3"
                  style={{ background: isCandidate(f.id) ? "rgba(245,158,11,0.02)" : "rgba(255,255,255,0.02)", border: "1px solid rgba(100,100,220,0.06)" }}>
                  <FileText size={14} color={isCandidate(f.id) ? "#F59E0B" : "#8080B0"} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate" style={{ color: "#EDEDFD" }}>{f.file_name}</div>
                    <div className="mt-0.5 text-xs truncate" style={{ color: "#6060A0" }} title={f.current_path}>{f.current_path?.length > 60 ? f.current_path.slice(0, 57) + "…" : f.current_path}</div>
                  </div>
                  <div className="shrink-0 text-right text-xs" style={{ color: "#6060A0" }}>{formatBytes(f.size_bytes)}</div>
                  <div className="shrink-0 text-right text-xs" style={{ color: "#6060A0" }}>{f.trashed_at ? formatTime(f.trashed_at) : ""}</div>
                  <button onClick={() => handleRestore(f.id)} disabled={restoringId === f.id}
                    className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all hover:bg-white/5 disabled:opacity-40"
                    style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.15)", color: "#6EE7B7" }}>
                    <RotateCcw size={11} /> {restoringId === f.id ? "Restoring…" : "Restore"}
                  </button>
                  <FileActionMenu fileId={f.id} fileName={f.file_name} status="trashed" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function StatBlock({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)", border: "1px solid rgba(100,100,220,0.1)" }}>
      <div className="text-xs" style={{ color: "#6060A0" }}>{label}</div>
      <div className="mt-1 text-lg font-semibold" style={{ color: valueColor ?? "#EDEDFD", fontFamily: "var(--font-mono)" }}>{value}</div>
    </div>
  );
}
