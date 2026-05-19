import { MessageSquare, Settings, Database, LayoutDashboard, X, Zap, Clock, Library, GanttChartSquare } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useStore } from "../store"
import type { View } from "../types"

const NAV: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "chat",     label: "Chat",     icon: MessageSquare },
  { id: "sessions", label: "Sessions", icon: Clock },
  { id: "dashboard", label: "Dashboard", icon: GanttChartSquare },
  { id: "admin",    label: "Admin",    icon: LayoutDashboard },
  { id: "memory",   label: "Memory",   icon: Database },
  { id: "sources",  label: "Sources",  icon: Library },
  { id: "settings", label: "Settings", icon: Settings },
]

export function Sidebar() {
  const { view, sidebarOpen, sessions, activeSessionId, setView, setSidebar, switchSession } = useStore()

  return (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={() => setSidebar(false)} />
      )}

      <aside
        className={[
          "fixed top-0 left-0 h-full z-40 flex flex-col",
          "w-64 bg-bg-2 border-r border-border",
          "transition-transform duration-200 ease-out",
          "lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center">
              <span className="text-sm">🐾</span>
            </div>
            <span className="font-semibold text-text tracking-tight">RadClaw</span>
          </div>
          <button onClick={() => setSidebar(false)} className="lg:hidden p-1.5 rounded-md text-text-2 hover:text-text hover:bg-bg-3 transition-colors">
            <X size={16} />
          </button>
        </div>

        <nav className="px-2 py-3 space-y-0.5 shrink-0">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={[
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                view === id
                  ? "bg-accent/15 text-accent border border-accent/20"
                  : "text-text-2 hover:text-text hover:bg-bg-3",
              ].join(" ")}
            >
              <Icon size={16} className="shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {sessions.length > 0 && (
          <div className="flex-1 overflow-y-auto border-t border-border px-2 py-2">
            <p className="text-[11px] font-semibold text-text-3 uppercase tracking-wider px-3 pb-1.5">Recent sessions</p>
            <div className="space-y-0.5">
              {[...sessions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 10).map((s) => (
                <button
                  key={s.id}
                  onClick={() => { switchSession(s.id); setView("chat") }}
                  className={[
                    "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all text-left",
                    s.id === activeSessionId
                      ? "bg-accent/10 text-accent"
                      : "text-text-2 hover:text-text hover:bg-bg-3",
                  ].join(" ")}
                >
                  <MessageSquare size={12} className="shrink-0 opacity-60" />
                  <span className="truncate">{s.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="px-4 py-3 border-t border-border shrink-0">
          <div className="flex items-center gap-2 text-xs text-text-3">
            <Zap size={12} className="text-accent" />
            <span>Powered by OpenCode</span>
          </div>
        </div>
      </aside>
    </>
  )
}
