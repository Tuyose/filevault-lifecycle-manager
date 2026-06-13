import { PlaceholderPage } from "../../components/layout/PlaceholderPage";

export function DuplicatesPage() {
  return (
    <PlaceholderPage
      title="Duplicates"
      description="Find files with identical content regardless of name or path. Two-stage detection: cheap size/pre-hash pre-filter, then BLAKE3 for the definitive check."
      bullets={[
        "Group by (size, partial_hash) for fast pre-filter",
        "BLAKE3 confirmation across candidate sets",
        "Per-group reclaimable byte estimate",
        "Bulk archive or trash with per-row overrides",
      ]}
    />
  );
}
