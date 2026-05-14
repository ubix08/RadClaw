import { useState } from "react"
import { MessageSquare, Plus, Trash2, Pencil, Check, X, Menu } from "lucide-react"
import { useStore } from "../store"

export function SessionsPage() {
  const { sessions, activeSessionId, switchSession, deleteSession, renameSession, newSession, setSidebar } = useStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")

  const startRename = (id: string, title: string) => {
    setEditingId(id)
    setEditValue(title)
  }

  const commitRename = (id: string) => {
    if (editValue.trim()) renameSession(id, editValue.trim())
    setEditingId(null)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => setSidebar(true)} className="lg:hidden p-2 rounded-lg text-text-2 hover:text-text hover:bg-bg-3 transition-colors">
            <Menu size={18} />
          </button>
          <span className="font-semibold text-text">Sessions</span>
          <span className="text-xs text-text-3 ml-1">({sessions.length})</span>
        </div>
        <button
          onClick={() => void newSession()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-accent/15 text-accent border border-accent/25 hover:bg-accent/25 transition-colors"
        >
          <Plus size={14} />
          <span className="hidden sm:inline">New</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 max-w-3xl mx-auto w-full">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-text-3">
            <MessageSquare size={32} className="opacity-30" />
            <p className="text-sm">No sessions yet.</p>
            <p className="text-xs">Start a chat and messages will be saved automatically.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`group flex items-center gap-3 px-4 py-3 rounded-xl border transition-all cursor-pointer ${
                  s.id === activeSessionId
                    ? "bg-accent/10 border-accent/25"
                    : "bg-bg-3 border-border hover:border-border-2 hover:bg-bg-4"
                }`}
                onClick={() => switchSession(s.id)}
              >
                <MessageSquare size={16} className="shrink-0 text-text-3" />

                <div className="flex-1 min-w-0">
                  {editingId === s.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(s.id)
                          if (e.key === "Escape") setEditingId(null)
                        }}
                        className="flex-1 bg-bg-4 border border-border rounded px-2 py-1 text-sm text-text outline-none focus:border-border-2"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button onClick={(e) => { e.stopPropagation(); commitRename(s.id) }} className="p-1 text-accent hover:text-accent/80">
                        <Check size={14} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setEditingId(null) }} className="p-1 text-text-3 hover:text-text-2">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-text truncate">{s.title}</p>
                  )}
                  <p className="text-xs text-text-3 mt-0.5">
                    {s.messages.length} message{s.messages.length !== 1 ? "s" : ""} &middot;{" "}
                    {new Date(s.updatedAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); startRename(s.id, s.title) }}
                    className="p-1.5 rounded-md text-text-3 hover:text-text hover:bg-bg-4 transition-colors"
                    title="Rename"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSession(s.id) }}
                    className="p-1.5 rounded-md text-text-3 hover:text-red-400 hover:bg-bg-4 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
