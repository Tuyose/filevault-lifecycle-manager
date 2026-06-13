import { PlaceholderPage } from "../../components/layout/PlaceholderPage";

export function TrashPage() {
  return (
    <PlaceholderPage
      title="Trash"
      description="Soft-deleted files with a configurable grace period. Nothing is permanently removed until you say so (or retention rules fire)."
      bullets={[
        "Soft-delete via in-place move to .filevault-trash",
        "Configurable grace period (default 30 days)",
        "Bulk restore to original path",
        "Manual purge with double-confirmation",
      ]}
    />
  );
}
