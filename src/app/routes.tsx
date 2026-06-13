import { Navigate, Route, Routes } from "react-router-dom";

import { DashboardPage } from "../features/dashboard/DashboardPage";
import { ScannerPage } from "../features/scanner/ScannerPage";
import { DuplicatesPage } from "../features/duplicates/DuplicatesPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { ArchivePage } from "../features/archive/ArchivePage";
import { TrashPage } from "../features/trash/TrashPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/scanner" element={<ScannerPage />} />
      <Route path="/duplicates" element={<DuplicatesPage />} />
      <Route path="/settings" element={<SettingsPage />} />

      {/* New UI screens — placeholders until migrated */}
      <Route path="/analytics" element={<div className="flex h-full items-center justify-center text-muted-foreground">Analytics (coming soon)</div>} />
      <Route path="/watch-folders" element={<div className="flex h-full items-center justify-center text-muted-foreground">Watch Folders (coming soon)</div>} />
      <Route path="/history" element={<div className="flex h-full items-center justify-center text-muted-foreground">History (coming soon)</div>} />

      {/* Legacy screens kept for backward compat during migration */}
      <Route path="/archive" element={<ArchivePage />} />
      <Route path="/trash" element={<TrashPage />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
