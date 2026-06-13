import { NavLink } from "react-router-dom";

const NAV = [
  { to: "/", label: "Dashboard", icon: "◉" },
  { to: "/scanner", label: "Scanner", icon: "◎" },
  { to: "/archive", label: "Archive", icon: "▣" },
  { to: "/trash", label: "Trash", icon: "⊝" },
  { to: "/duplicates", label: "Duplicates", icon: "⊜" },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-vault-border bg-vault-surface/80 backdrop-blur-sm">
      {/* App logo */}
      <div className="flex h-[56px] items-center gap-3 border-b border-vault-border px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-gradient-to-br from-vault-accent to-emerald-500 text-xs font-bold text-slate-900 shadow-sm shadow-vault-accent/20">
          F
        </div>
        <div className="text-sm font-semibold tracking-tight text-slate-100">
          FileVault
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              [
                "group relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm transition-all duration-[120ms] cubic-bezier(0.4,0,0.2,1)",
                isActive
                  ? "bg-vault-accent/8 text-vault-accent shadow-sm shadow-vault-accent/5"
                  : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200",
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                {/* Active indicator glow */}
                {isActive && (
                  <span className="absolute inset-0 rounded-[10px] bg-vault-accent/[0.06] blur-sm" />
                )}

                {/* Icon */}
                <span className="relative z-[1] w-5 text-center text-base leading-none">
                  {item.icon}
                </span>

                {/* Label */}
                <span className="relative z-[1] font-medium tracking-tight">
                  {item.label}
                </span>

                {/* Active dot */}
                {isActive && (
                  <span className="relative z-[1] ml-auto h-1.5 w-1.5 rounded-full bg-vault-accent" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-vault-border px-5 py-3">
        <div className="text-[11px] text-vault-muted/60 tracking-tight">v0.1.0 · local-first</div>
      </div>
    </aside>
  );
}
