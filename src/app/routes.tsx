import { Navigate, Route, Routes } from "react-router-dom";

import { DashboardPage } from "../features/dashboard/DashboardPage";
import { ScannerPage } from "../features/scanner/ScannerPage";
import { DuplicatesPage } from "../features/duplicates/DuplicatesPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { AnalyticsPage } from "../features/analytics/AnalyticsPage";
import { WatchFoldersPage } from "../features/watch-folders/WatchFoldersPage";
import { HistoryPage } from "../features/history/HistoryPage";
import { ArchivePage } from "../features/archive/ArchivePage";
import { TrashPage } from "../features/trash/TrashPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/analytics" element={<AnalyticsPage />} />
      <Route path="/scanner" element={<ScannerPage />} />
      <Route path="/duplicates" element={<DuplicatesPage />} />
      <Route path="/watch-folders" element={<WatchFoldersPage />} />
      <Route path="/archive" element={<ArchivePage />} />
      <Route path="/history" element={<HistoryPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/trash" element={<TrashPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
