import { Navigate, Route, Routes } from "react-router-dom";

import { ArchivePage } from "../features/archive/ArchivePage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { DuplicatesPage } from "../features/duplicates/DuplicatesPage";
import { ScannerPage } from "../features/scanner/ScannerPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { TrashPage } from "../features/trash/TrashPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/scanner" element={<ScannerPage />} />
      <Route path="/archive" element={<ArchivePage />} />
      <Route path="/trash" element={<TrashPage />} />
      <Route path="/duplicates" element={<DuplicatesPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
