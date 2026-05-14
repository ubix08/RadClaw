import { useEffect, useState, useCallback } from "react"
import { RefreshCw, Plus, Database, Menu } from "lucide-react"
import { useStore } from "../store"

export function MemoryPage() {
  const { getClient, setSidebar } = useStore()
  const [entries,  setEntries]  = useState<string[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [note,     setNote]     = useState("")
  const [adding,   setAdding]   = useState(false)
  const [addMsg,   setAddMsg]   = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { entries: e } = await getClient().getMemory()
      setEntries(e)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [getClient])

  useEffect(() => { void refresh() }, [refresh])

  const addNote = async () => {
    if (!note.trim()) return
    setAdding(true)
    setAddMsg(null)
    try {
      await getClient().addMemory(note.trim(), "web:admin")
      setAddMsg("Memory saved.")
      setNote("")
      setShowForm(false)
      await refresh()
    } catch (e) {
      setAddMsg(`Error: ${(e as Error).message}`)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => setSidebar(true)} className="lg:hidden p-2 rounded-lg text-text-2 hover:text-text hover:bg-bg-3 transition-colors">
            <Menu size={18} />
          </button>
          <span className="font-semibold text-text">Memory</span>
          <span className="text-xs text-text-3 ml-1">({entries.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-accent/15 text-accent border border-accent/25 hover:bg-accent/25 transition-colors"
          >
            <Plus size={14} />
            Add
          </button>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="p-2 rounded-lg text-text-2 hover:text-text hover:bg-bg-3 border border-border transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4 max-w-3xl mx-auto w-full">
        {error && (
          <div className="px-4 py-3 bg-red-900/20 border border-red-800/40 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Add form */}
        {showForm && (
          <div className="bg-bg-3 border border-border rounded-xl p-4 space-y-3 animate-fade-up">
            <p className="text-sm font-medium text-text">New memory entry</p>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Enter a durable fact to remember…"
              rows={3}
              className="w-full bg-bg-4 border border-border rounded-lg px-3 py-2.5 text-sm text-text placeholder:text-text-3 outline-none focus:border-border-2 resize-none"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => void addNote()}
                disabled={!note.trim() || adding}
                className="px-4 py-2 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-40"
              >
                {adding ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => { setShowForm(false); setNote("") }}
                className="px-3 py-2 rounded-lg text-sm text-text-2 hover:text-text hover:bg-bg-4 transition-colors"
              >
                Cancel
              </button>
              {addMsg && <p className="text-xs text-accent ml-auto">{addMsg}</p>}
            </div>
          </div>
        )}

        {/* Entries */}
        {loading && entries.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw size={20} className="animate-spin text-text-3" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-text-3">
            <Database size={32} className="opacity-30" />
            <p className="text-sm">No memory entries yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry, i) => (
              <div
                key={`${i}-${entry.slice(0, 20)}`}
                className="group flex items-start gap-3 px-4 py-3 bg-bg-3 border border-border rounded-xl hover:border-border-2 transition-colors animate-fade-up"
              >
                <span className="text-xs text-text-3 font-mono mt-0.5 shrink-0 w-5 text-right">
                  {i + 1}
                </span>
                <p className="text-sm text-text flex-1 leading-relaxed">{entry}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
