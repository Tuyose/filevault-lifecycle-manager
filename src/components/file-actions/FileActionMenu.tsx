import { useState } from "react";
import { Archive, FolderOpen, FileSearch, Copy, Check } from "lucide-react";
import { ipc } from "../../lib/ipc";

type Props = {
  fileId: string;
  fileName?: string;
  status: string;
  hasArchiveRoot?: boolean;
  onArchived?: () => void;
  onError?: (msg: string) => void;
};

export function FileActionMenu({ fileId, fileName, status, hasArchiveRoot, onArchived, onError }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [copied, setCopied] = useState(false);

  const canArchive = status === "active" && hasArchiveRoot;
  const filesExist = status !== "deleted";

  const archiveTooltip = !hasArchiveRoot
    ? "Choose an archive folder first."
    : status === "archived"
    ? "File is already archived."
    : status === "active"
    ? null
    : `Cannot archive: status is ${status}`;

  async function handleArchive() {
    setArchiving(true);
    try {
      await ipc.archiveFile(fileId);
      setShowConfirm(false);
      onArchived?.();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally { setArchiving(false); }
  }

  async function handleCopyPath() {
    try {
      const path = await ipc.getFileCurrentPath(fileId);
      await navigator.clipboard.writeText(path);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <div className="flex items-center gap-1">
        {/* Archive */}
        <button
          onClick={() => { if (canArchive) setShowConfirm(true); }}
          disabled={!canArchive}
          title={archiveTooltip ?? "Archive this file"}
          className="rounded-md p-1.5 text-xs transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-30 hover:bg-white/5"
          style={{ color: canArchive ? "#818CF8" : "#6060A0" }}
        >
          <Archive size={13} />
        </button>

        {/* Reveal in Explorer */}
        <button
          onClick={() => ipc.revealFileInExplorer(fileId).catch((e) => onError?.(e))}
          disabled={!filesExist}
          title="Reveal in Explorer"
          className="rounded-md p-1.5 text-xs transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-30 hover:bg-white/5"
          style={{ color: "#8080B0" }}
        >
          <FileSearch size={13} />
        </button>

        {/* Open folder */}
        <button
          onClick={() => ipc.openContainingFolder(fileId).catch((e) => onError?.(e))}
          disabled={!filesExist}
          title="Open containing folder"
          className="rounded-md p-1.5 text-xs transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-30 hover:bg-white/5"
          style={{ color: "#8080B0" }}
        >
          <FolderOpen size={13} />
        </button>

        {/* Copy path */}
        <button
          onClick={handleCopyPath}
          title="Copy path"
          className="rounded-md p-1.5 text-xs transition-all duration-150 disabled:opacity-30 hover:bg-white/5"
          style={{ color: copied ? "#10B981" : "#8080B0" }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>

      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowConfirm(false)}>
          <div className="rounded-2xl p-6 shadow-2xl" style={{ background: "#0D0D1A", border: "1px solid rgba(99,102,241,0.15)", maxWidth: 380 }}
            onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "#EDEDFD" }}>Archive this file?</h3>
            <p style={{ fontSize: 13, color: "#6060A0", marginTop: 6 }}>
              {fileName && <><strong style={{ color: "#8080B0" }}>{fileName}</strong> will be </>}
              moved to your FileVault archive. You can restore it later. Nothing is deleted.
            </p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setShowConfirm(false)} disabled={archiving}
                className="cursor-pointer rounded-lg px-4 py-2 text-xs font-medium transition-all duration-150"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(100,100,220,0.1)", color: "#6060A0" }}>
                Cancel
              </button>
              <button onClick={handleArchive} disabled={archiving}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all duration-150 disabled:opacity-40"
                style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#A5B4FC" }}>
                <Archive size={13} /> {archiving ? "Archiving…" : "Archive"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
