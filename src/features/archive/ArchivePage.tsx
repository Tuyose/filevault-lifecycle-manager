import { PlaceholderPage } from "../../components/layout/PlaceholderPage";

export function ArchivePage() {
  return (
    <PlaceholderPage
      title="Archive"
      description="Cold storage for files you don't want to delete but no longer want in your active folders. Restorable until manually purged."
      bullets={[
        "Per-vault archive root with stable internal layout",
        "Original path preserved for one-click restore",
        "Lifecycle events emitted for every move",
        "BLAKE3 hash verified on archive + restore",
      ]}
    />
  );
}
