import { useState, useEffect, useCallback } from "react"
import { useStore } from "../store"
import type { Source, SourceType } from "../types"
import { Globe, Youtube, Image, FileText, Table, Trash2, Plus, Loader } from "lucide-react"

const TYPE_ICONS: Record<SourceType, typeof Globe> = {
  url: Globe,
  youtube: Youtube,
  image: Image,
  text: FileText,
  pdf: FileText,
  spreadsheet: Table,
}

const TYPE_COLORS: Record<SourceType, string> = {
  url: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  youtube: "bg-red-500/20 text-red-400 border-red-500/30",
  image: "bg-green-500/20 text-green-400 border-green-500/30",
  text: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  pdf: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  spreadsheet: "bg-teal-500/20 text-teal-400 border-teal-500/30",
}

export function SourcesPage() {
  const { getClient } = useStore()
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [type, setType] = useState<SourceType>("url")
  const [title, setTitle] = useState("")
  const [url, setUrl] = useState("")
  const [content, setContent] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const { sources: data } = await getClient().getSources()
      setSources(data)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await getClient().addSource({
        type,
        title: title.trim(),
        url: url.trim() || undefined,
        content: content.trim(),
      })
      setShowForm(false)
      setTitle("")
      setUrl("")
      setContent("")
      await load()
    } catch (e) {
      alert(`Failed to add source: ${(e as Error).message}`)
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    try {
      await getClient().deleteSource(id)
      setSources((prev) => prev.filter((s) => s.id !== id))
    } catch (e) {
      alert(`Failed to delete source: ${(e as Error).message}`)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 h-14 border-b border-border shrink-0">
        <h1 className="text-lg font-semibold text-text">Sources</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          <Plus size={16} />
          Add Source
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {showForm && (
          <div className="bg-bg-2 border border-border rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {(["url", "youtube", "text"] as SourceType[]).map((t) => {
                const Icon = TYPE_ICONS[t]
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${type === t ? TYPE_COLORS[t] : "border-border text-text-2 hover:text-text hover:bg-bg-3"}`}
                  >
                    <Icon size={14} />
                    {t === "url" ? "Web Page" : t === "youtube" ? "YouTube" : "Paste Text"}
                  </button>
                )
              })}
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Source title"
              className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm placeholder:text-text-3 outline-none focus:border-accent/50 transition-colors"
            />
            {(type === "url" || type === "youtube") && (
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={type === "youtube" ? "YouTube video URL" : "Web page URL"}
                className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm placeholder:text-text-3 outline-none focus:border-accent/50 transition-colors"
              />
            )}
            {type === "text" && (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste or type text content..."
                rows={4}
                className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm placeholder:text-text-3 outline-none focus:border-accent/50 transition-colors resize-none"
              />
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 rounded-lg text-sm text-text-2 hover:text-text border border-border hover:bg-bg-3 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={saving || !title.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />}
                Save
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12 text-text-3">
            <Loader size={20} className="animate-spin" />
          </div>
        ) : sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-3">
            <Globe size={40} className="opacity-30 mb-3" />
            <p className="text-sm">No sources yet</p>
            <p className="text-xs mt-1">Add web pages, YouTube videos, or text documents for reference</p>
          </div>
        ) : (
          sources.map((s) => {
            const Icon = TYPE_ICONS[s.type]
            return (
              <div key={s.id} className="bg-bg-2 border border-border rounded-xl p-4 flex items-start gap-3 group">
                <div className={`shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center ${TYPE_COLORS[s.type]}`}>
                  <Icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text truncate">{s.title}</span>
                    <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border ${TYPE_COLORS[s.type]}`}>
                      {s.type}
                    </span>
                  </div>
                  {s.url && <p className="text-xs text-text-3 truncate mt-0.5">{s.url}</p>}
                  {s.content && (
                    <details className="mt-2">
                      <summary className="text-xs text-accent cursor-pointer hover:underline">Preview</summary>
                      <pre className="mt-1 text-xs text-text-2 bg-bg rounded-lg p-2 max-h-32 overflow-y-auto whitespace-pre-wrap">{s.content}</pre>
                    </details>
                  )}
                  <p className="text-[10px] text-text-3 mt-1">{new Date(s.addedAt).toLocaleString()}</p>
                </div>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="shrink-0 p-1.5 rounded-lg text-text-3 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
