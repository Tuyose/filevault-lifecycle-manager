import { NavLink } from "react-router-dom";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/scanner", label: "Scanner" },
  { to: "/archive", label: "Archive" },
  { to: "/trash", label: "Trash" },
  { to: "/duplicates", label: "Duplicates" },
  { to: "/settings", label: "Settings" },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-vault-border bg-vault-surface">
      <div className="flex h-14 items-center gap-2 border-b border-vault-border px-4">
        <div className="h-6 w-6 rounded-md bg-vault-accent" />
        <div className="text-sm font-semibold tracking-wide text-slate-100">
          FileVault
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-2">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              [
                "rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-vault-accent/10 text-vault-accent"
                  : "text-slate-300 hover:bg-white/5 hover:text-slate-100",
              ].join(" ")
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-vault-border p-3 text-xs text-vault-muted">
        v0.1.0 · local-first
      </div>
    </aside>
  );
}
