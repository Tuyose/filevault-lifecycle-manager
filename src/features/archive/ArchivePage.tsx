import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Archive, FolderOpen, CheckCircle2, X } from "lucide-react";

import { dialogs, ipc } from "../../lib/ipc";
import type { ArchiveInfo } from "../../types/ipc";
import { PageShell } from "../../components/layout/PageShell";

export function ArchivePage() {
  const [info, setInfo] = useState<ArchiveInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const data = await ipc.getArchiveInfo();
      setInfo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  async function handleSetRoot() {
    const picked = await dialogs.pickFolder();
    if (!picked) return;
    try {
      await ipc.setArchiveRoot(picked);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleClear() {
    await ipc.clearArchiveRoot();
    await load();
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
        {/* Error banner */}
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

        {/* Not configured state */}
        {!info?.root && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-6 rounded-2xl p-12 text-center"
            style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.04) 0%, rgba(16,185,129,0.02) 100%)", border: "1px solid rgba(100,100,220,0.1)" }}>
            <Archive size={48} style={{ color: "#6060A0", opacity: 0.3 }} />
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: "#EDEDFD", margin: 0 }}>Choose an archive location</h2>
              <p style={{ fontSize: 13, color: "#6060A0", marginTop: 6, maxWidth: 380 }}>
                Archived files will be moved here safely. Nothing is deleted permanently. FileVault uses a structured folder layout to prevent conflicts.
              </p>
            </div>
            <button onClick={handleSetRoot}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-150"
              style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#A5B4FC" }}>
              <FolderOpen size={15} /> Choose archive folder
            </button>
          </motion.div>
        )}

        {/* Configured state */}
        {info?.root && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
            {/* Status card */}
            <div className="rounded-2xl p-6"
              style={{ background: "linear-gradient(135deg, #0F0F20 0%, #0D0D1A 60%, #0A0A18 100%)", border: "1px solid rgba(99,102,241,0.15)" }}>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} color="#10B981" />
                <span style={{ fontSize: 14, fontWeight: 600, color: "#10B981" }}>Ready</span>
              </div>
              <div className="mt-3 font-mono text-sm" style={{ color: "#EDEDFD" }}>{info.root}</div>
              <div className="mt-1 text-xs" style={{ color: "#6060A0" }}>Write access verified</div>
            </div>

            {/* Preview */}
            <div className="rounded-xl p-5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(100,100,220,0.08)" }}>
              <div className="text-xs font-medium" style={{ color: "#6060A0" }}>Archive path preview</div>
              <div className="mt-2 font-mono text-xs" style={{ color: "#8080B0" }}>
                {info.root}<span style={{ color: "#818CF8" }}>\.filevault-archive\</span>
                <span style={{ color: "#6060A0" }}>&lt;file_id&gt;\&lt;filename&gt;</span>
              </div>
            </div>

            {/* Archived summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)", border: "1px solid rgba(100,100,220,0.1)" }}>
                <div className="text-xs" style={{ color: "#6060A0" }}>Archived files</div>
                <div className="mt-1 text-lg font-semibold" style={{ color: "#EDEDFD", fontFamily: "var(--font-mono)" }}>{info.archivedCount}</div>
              </div>
              <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)", border: "1px solid rgba(100,100,220,0.1)" }}>
                <div className="text-xs" style={{ color: "#6060A0" }}>Status</div>
                <div className="mt-1 text-sm font-medium" style={{ color: "#10B981" }}>Active</div>
              </div>
            </div>

            {/* Actions */}
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

            {/* Safety info */}
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
