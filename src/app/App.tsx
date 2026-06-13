import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sidebar, type Screen } from "../components/layout/Sidebar";
import { PageTransition } from "../components/layout/PageTransition";
import { ScanJobProvider, GlobalActivityBar } from "../features/scan/scan-store";
import { AppRoutes } from "./routes";

export default function App() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState<Screen>("overview");

  const handleNavigate = (screen: Screen) => {
    setCurrent(screen);
    const routeMap: Record<Screen, string> = {
      overview: "/", analytics: "/analytics", files: "/scanner",
      watchfolders: "/watch-folders", cleanup: "/duplicates",
      archive: "/archive", history: "/history", settings: "/settings",
    };
    navigate(routeMap[screen]);
  };

  return (
    <ScanJobProvider>
      <div className="flex h-full w-full">
        <Sidebar current={current} onNavigate={handleNavigate} />
        <main className="flex-1 overflow-hidden">
          <PageTransition>
            <AppRoutes />
          </PageTransition>
        </main>
      </div>
      <GlobalActivityBar />
    </ScanJobProvider>
  );
}
