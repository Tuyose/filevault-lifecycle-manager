import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Archive, FolderOpen, CheckCircle2, X, FileText, RotateCcw } from "lucide-react";

import { dialogs, ipc } from "../../lib/ipc";
import type { ArchiveInfo } from "../../types/ipc";
import { formatBytes, formatTime } from "../../lib/folder-insights";
import { PageShell } from "../../components/layout/PageShell";
import { FileActionMenu } from "../../components/file-actions/FileActionMenu";

export function ArchivePage() {
  const [info, setInfo] = useState<ArchiveInfo | null>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [data, flist] = await Promise.all([
        ipc.getArchiveInfo(),
        ipc.listArchivedFiles().catch(() => [] as any[]),
      ]);
      setInfo(data);
      setFiles(flist ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  async function handleSetRoot() {
    const picked = await dialogs.pickFolder();
    if (!picked) return;
    try { await ipc.setArchiveRoot(picked); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  async function handleClear() {
    await ipc.clearArchiveRoot();
    await load();
  }

  async function handleRestore(fileId: string) {
    setRestoringId(fileId); setError(null);
    try {
      await ipc.restoreFile(fileId, "rename");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setRestoringId(null); }
  }

  if (loading) {
    return (
      <PageShell title="Archive" subtitle="Manage archived file storage">
        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }} />
          ))}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Archive" subtitle="Manage archived file storage">
      <div className="flex flex-col gap-6">
        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex items-start gap-3 rounded-xl px-5 py-4"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
            <X size={16} color="#EF4444" style={{ marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#FCA5A5" }}>Error</div>
              <div style={{ fontSize: 12, color: "#F87171", marginTop: 2 }}>{error}</div>
            </div>
            <button onClick={() => setError(null)}
              className="ml-auto cursor-pointer rounded-md px-2 py-1 text-xs transition-colors hover:bg-white/5" style={{ color: "#F87171" }}>
              Dismiss
            </button>
          </motion.div>
        )}

        {!info?.archiveRoot && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-6 rounded-2xl p-12 text-center"
            style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.04) 0%, rgba(16,185,129,0.02) 100%)", border: "1px solid rgba(100,100,220,0.1)" }}>
            <Archive size={48} style={{ color: "#6060A0", opacity: 0.3 }} />
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: "#EDEDFD", margin: 0 }}>Choose an archive location</h2>
              <p style={{ fontSize: 13, color: "#6060A0", marginTop: 6, maxWidth: 380 }}>
                Archived files will be moved here safely. Nothing is deleted permanently.
              </p>
            </div>
            <button onClick={handleSetRoot}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-150"
              style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#A5B4FC" }}>
              <FolderOpen size={15} /> Choose archive folder
            </button>
          </motion.div>
        )}

        {info?.archiveRoot && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
            <div className="rounded-2xl p-6" style={{ background: "linear-gradient(135deg, #0F0F20 0%, #0D0D1A 60%, #0A0A18 100%)", border: "1px solid rgba(99,102,241,0.15)" }}>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} color="#10B981" />
                <span style={{ fontSize: 14, fontWeight: 600, color: "#10B981" }}>Ready</span>
              </div>
              <div className="mt-3 font-mono text-sm" style={{ color: "#EDEDFD" }}>{info.archiveRoot}</div>
              <div className="mt-1 text-xs" style={{ color: "#6060A0" }}>Write access verified</div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <StatBlock label="Archived files" value={info.archivedFiles.toString()} />
              <StatBlock label="Total size" value={formatBytes(info.archivedSizeBytes)} />
              <StatBlock label="Status" value="Active" valueColor="#10B981" />
            </div>

            {/* Archived files */}
            <div>
              <h3 className="mb-3 text-sm font-semibold" style={{ color: "#EDEDFD" }}>
                Archived Files {files.length > 0 && <span className="font-normal" style={{ color: "#6060A0" }}>({files.length})</span>}
              </h3>
              {files.length === 0 ? (
                <div className="flex flex-col items-center gap-4 rounded-xl p-10 text-center"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(100,100,220,0.06)" }}>
                  <FileText size={24} style={{ color: "#6060A0", opacity: 0.3 }} />
                  <p style={{ fontSize: 13, color: "#6060A0", maxWidth: 320 }}>
                    No archived files yet. Archive candidates will appear here once you move files into FileVault Archive.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {files.map((f: any) => (
                    <div key={f.id} className="flex items-center gap-4 rounded-lg px-4 py-3"
                      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(100,100,220,0.06)" }}>
                      <FileText size={14} color="#8080B0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate" style={{ color: "#EDEDFD" }}>{f.file_name}</div>
                        <div className="mt-0.5 text-xs truncate" style={{ color: "#6060A0" }} title={f.current_path}>
                          {f.current_path?.length > 60 ? f.current_path.slice(0, 57) + "…" : f.current_path}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-xs" style={{ color: "#6060A0" }}>{formatBytes(f.size_bytes)}</div>
                      <div className="shrink-0 text-right text-xs" style={{ color: "#6060A0" }}>
                        {f.archived_at ? formatTime(f.archived_at) : ""}
                      </div>
                      <button onClick={() => handleRestore(f.id)}
                        disabled={restoringId === f.id}
                        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 hover:bg-white/5 disabled:opacity-40"
                        style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)", color: "#818CF8" }}>
                        <RotateCcw size={11} /> {restoringId === f.id ? "Restoring…" : "Restore"}
                      </button>
                      <FileActionMenu
                        fileId={f.id}
                        fileName={f.file_name}
                        status="archived"
                        hasArchiveRoot={!!info?.archiveRoot}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={handleSetRoot}
                className="cursor-pointer rounded-lg px-4 py-2 text-xs font-medium transition-all duration-150"
                style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", color: "#818CF8" }}>
                Change folder
              </button>
              <button onClick={handleClear}
                className="cursor-pointer rounded-lg px-4 py-2 text-xs font-medium transition-all duration-150"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", color: "#F87171" }}>
                Clear archive root
              </button>
            </div>

            <div className="rounded-xl p-5" style={{ background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.1)" }}>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} color="#10B981" />
                <span style={{ fontSize: 12, fontWeight: 500, color: "#6EE7B7" }}>Local-first · No cloud sync · No telemetry</span>
              </div>
            </div>
          </motion.div>
        )}
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
