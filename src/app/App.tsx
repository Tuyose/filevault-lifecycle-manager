import { Sidebar } from "../components/layout/Sidebar";
import { PageTransition } from "../components/layout/PageTransition";
import { AppRoutes } from "./routes";

export default function App() {
  return (
    <div className="flex h-full w-full bg-vault-bg text-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <PageTransition>
          <AppRoutes />
        </PageTransition>
      </main>
    </div>
  );
}
