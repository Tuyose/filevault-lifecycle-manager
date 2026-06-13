import { useState } from "react";

import { ipc } from "../../lib/ipc";
import { PlaceholderPage } from "../../components/layout/PlaceholderPage";

export function ScannerPage() {
  const [path, setPath] = useState("");
  const [ack, setAck] = useState<string | null>(null);

  async function handlePreview() {
    if (!path) return;
    try {
      const preview = await ipc.scanFolderPreview(path);
      setAck(
        `Rust acknowledged scan for ${preview.requested_path} (would_scan=${preview.would_scan})`,
      );
    } catch (err) {
      setAck(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <PlaceholderPage
      title="Scanner"
      description="Pick a folder to index. Real scanning will walk the tree, hash new files with BLAKE3, and record lifecycle events."
      bullets={[
        "Recursive walk with skip rules for .git, node_modules, etc.",
        "BLAKE3 hashing pipeline with chunked I/O",
        "Progress events streamed to the UI",
        "Per-scan dedup pre-filter by file size",
      ]}
      actions={
        <div className="flex items-center gap-2">
          <input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="C:\\Users\\you\\Documents"
            className="w-72 rounded-md border border-vault-border bg-vault-bg px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-vault-accent"
          />
          <button
            type="button"
            onClick={handlePreview}
            className="rounded-md border border-vault-accent/40 bg-vault-accent/10 px-3 py-1.5 text-sm text-vault-accent hover:bg-vault-accent/20"
          >
            Preview scan
          </button>
        </div>
      }
    >
      {ack && (
        <div className="rounded-md border border-vault-border bg-vault-surface px-4 py-2 text-xs text-vault-muted">
          {ack}
        </div>
      )}
    </PlaceholderPage>
  );
}
