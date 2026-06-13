import { PlaceholderPage } from "../../components/layout/PlaceholderPage";

export function SettingsPage() {
  return (
    <PlaceholderPage
      title="Settings"
      description="User preferences and retention rules. Persisted in the `app_settings` table as JSON values keyed by setting name."
      bullets={[
        "Trash grace period",
        "Archive root directory",
        "Hash chunk size",
        "Excluded paths / glob patterns",
        "Telemetry: disabled (local-first by design)",
      ]}
    />
  );
}
