import { useEffect, useState, useCallback } from "react"
import { RefreshCw, Play, CheckCircle, XCircle, Clock, Cpu, Menu } from "lucide-react"
import { useStore } from "../store"
import type { AdminStatus, HeartbeatStatus } from "../types"

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-bg-3 border border-border rounded-xl p-4">
      <p className="text-xs text-text-3 mb-1">{label}</p>
      <p className="text-lg font-semibold text-text font-mono">{value}</p>
      {sub && <p className="text-xs text-text-2 mt-0.5">{sub}</p>}
    </div>
  )
}

function formatUptime(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return [h && `${h}h`, m && `${m}m`, `${sec}s`].filter(Boolean).join(" ")
}

export function AdminPage() {
  const { getClient, setSidebar } = useStore()
  const [status,    setStatus]    = useState<AdminStatus | null>(null)
  const [hbStatus,  setHbStatus]  = useState<HeartbeatStatus | null>(null)
  const [hbRunning, setHbRunning] = useState(false)
  const [hbResult,  setHbResult]  = useState<string | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [loading,   setLoading]   = useState(false)

  const [wlChannel, setWlChannel] = useState<"telegram" | "whatsapp">("telegram")
  const [wlUserID,  setWlUserID]  = useState("")
  const [wlMsg,     setWlMsg]     = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const client = getClient()
      const [s, h] = await Promise.all([client.adminStatus(), client.heartbeatStatus()])
      setStatus(s)
      setHbStatus(h)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [getClient])

  useEffect(() => { void refresh() }, [refresh])

  const runHeartbeat = async () => {
    setHbRunning(true)
    setHbResult(null)
    try {
      const { result } = await getClient().runHeartbeat()
      setHbResult(result)
    } catch (e) {
      setHbResult(`Error: ${(e as Error).message}`)
    } finally {
      setHbRunning(false)
    }
  }

  const addWhitelist = async () => {
    if (!wlUserID.trim()) return
    setWlMsg(null)
    try {
      const { created } = await getClient().addWhitelist(wlChannel, wlUserID.trim())
      setWlMsg(created ? "User added to whitelist." : "User already whitelisted.")
      setWlUserID("")
    } catch (e) {
      setWlMsg(`Error: ${(e as Error).message}`)
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
          <span className="font-semibold text-text">Admin Dashboard</span>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-text-2 hover:text-text hover:bg-bg-3 border border-border transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6 max-w-3xl mx-auto w-full">
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-900/20 border border-red-800/40 rounded-xl text-red-400 text-sm">
            <XCircle size={16} />
            {error}
          </div>
        )}

        {!status && !error && (
          <div className="flex items-center justify-center py-20">
            <RefreshCw size={20} className="animate-spin text-text-3" />
          </div>
        )}

        {/* Server stats */}
        {status && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Cpu size={14} className="text-accent" />
              <h2 className="text-sm font-semibold text-text-2 uppercase tracking-wider">Server</h2>
              <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-mono ${status.status === "ok" ? "bg-green-900/30 text-green-400 border border-green-800/40" : "bg-red-900/30 text-red-400"}`}>
                {status.status}
              </span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Uptime"   value={formatUptime(status.uptime)} />
              <StatCard label="PID"      value={String(status.pid)} />
              <StatCard label="Version"  value={status.version} />
              <StatCard label="Channels" value={status.channels.join(", ")} />
            </div>
          </section>
        )}

        {/* Heartbeat */}
        {hbStatus && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-accent" />
              <h2 className="text-sm font-semibold text-text-2 uppercase tracking-wider">Heartbeat</h2>
            </div>
            <div className="bg-bg-3 border border-border rounded-xl p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-text-3 text-xs mb-1">File</p>
                  <p className="font-mono text-text-2 text-xs truncate">{hbStatus.file}</p>
                </div>
                <div>
                  <p className="text-text-3 text-xs mb-1">Tasks</p>
                  <p className="text-text font-semibold">{hbStatus.taskCount}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {hbStatus.empty ? (
                  <span className="flex items-center gap-1.5 text-xs text-yellow-500">
                    <XCircle size={12} /> No tasks — heartbeat disabled
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-green-400">
                    <CheckCircle size={12} /> Active
                  </span>
                )}

                <button
                  onClick={() => void runHeartbeat()}
                  disabled={hbRunning || hbStatus.empty}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 text-accent border border-accent/25 text-sm hover:bg-accent/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Play size={12} className={hbRunning ? "animate-pulse" : ""} />
                  {hbRunning ? "Running…" : "Run now"}
                </button>
              </div>

              {hbResult && (
                <div className="bg-bg-4 border border-border rounded-lg px-3 py-2.5 text-xs font-mono text-text-2 whitespace-pre-wrap">
                  {hbResult}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Whitelist */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle size={14} className="text-accent" />
            <h2 className="text-sm font-semibold text-text-2 uppercase tracking-wider">Whitelist</h2>
          </div>
          <div className="bg-bg-3 border border-border rounded-xl p-4 space-y-3">
            <p className="text-xs text-text-3">Add a user ID to allow access via Telegram or WhatsApp.</p>
            <div className="flex gap-2 flex-col sm:flex-row">
              <select
                value={wlChannel}
                onChange={e => setWlChannel(e.target.value as "telegram" | "whatsapp")}
                className="bg-bg-4 border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-border-2 shrink-0"
              >
                <option value="telegram">Telegram</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
              <input
                value={wlUserID}
                onChange={e => setWlUserID(e.target.value)}
                placeholder="User ID…"
                className="flex-1 bg-bg-4 border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-3 outline-none focus:border-border-2"
              />
              <button
                onClick={() => void addWhitelist()}
                disabled={!wlUserID.trim()}
                className="px-4 py-2 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
            {wlMsg && (
              <p className="text-xs text-accent">{wlMsg}</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
