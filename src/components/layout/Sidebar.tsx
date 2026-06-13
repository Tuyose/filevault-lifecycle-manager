import { type LucideIcon, LayoutDashboard, BarChart3, FolderSearch, Eye, Sparkles, Archive, Trash2, Clock, Settings } from "lucide-react";
import { cn } from "../../lib/utils";

export type Screen =
  | "overview"
  | "analytics"
  | "files"
  | "watchfolders"
  | "cleanup"
  | "archive"
  | "trash"
  | "history"
  | "settings";

interface NavItem {
  id: Screen;
  label: string;
  icon: LucideIcon;
  route: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, route: "/" },
  { id: "analytics", label: "Analytics", icon: BarChart3, route: "/analytics" },
  { id: "files", label: "Files", icon: FolderSearch, route: "/scanner" },
  { id: "watchfolders", label: "Watch Folders", icon: Eye, route: "/watch-folders" },
  { id: "cleanup", label: "Cleanup", icon: Sparkles, route: "/duplicates" },
  { id: "archive", label: "Archive", icon: Archive, route: "/archive" },
  { id: "trash", label: "Trash", icon: Trash2, route: "/trash" },
  { id: "history", label: "History", icon: Clock, route: "/history" },
  { id: "settings", label: "Settings", icon: Settings, route: "/settings" },
];

interface SidebarProps {
  current: Screen;
  onNavigate: (screen: Screen) => void;
}

export function Sidebar({ current, onNavigate }: SidebarProps) {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-14 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-sm shadow-primary/30">
          F
        </div>
        <span className="text-base font-semibold tracking-tight text-sidebar-foreground">
          FileVault
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = current === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground/80",
              )}
            >
              <Icon size={18} className={cn(isActive ? "text-primary" : "text-sidebar-foreground/40")} />
              <span>{item.label}</span>
              {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-5 py-3">
        <p className="text-xs text-sidebar-foreground/40">v0.1.0 · local-first</p>
      </div>
    </aside>
  );
}
