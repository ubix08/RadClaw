import { useEffect, useState, useCallback } from "react"
import { RefreshCw, Menu, CheckCircle, XCircle, Clock, User, Code, FileText, BarChart3 } from "lucide-react"
import { useStore } from "../store"
import type { TaskRecord, TaskSummary } from "../types"

const STATUS_ICONS: Record<string, typeof Clock> = {
  pending: Clock,
  in_progress: RefreshCw,
  completed: CheckCircle,
  failed: XCircle,
}

const STATUS_COLORS: Record<string, string> = {
  pending: "text-yellow-500",
  in_progress: "text-blue-500",
  completed: "text-green-500",
  failed: "text-red-500",
}

const ROLE_ICONS: Record<string, typeof User> = {
  orchestrator: User,
  builder: Code,
  writer: FileText,
  analyst: BarChart3,
}

const ROLE_COLORS: Record<string, string> = {
  orchestrator: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  builder: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  writer: "bg-green-500/20 text-green-400 border-green-500/30",
  analyst: "bg-orange-500/20 text-orange-400 border-orange-500/30",
}

const TEAM = [
  { name: "rad", role: "orchestrator", label: "Rad", desc: "Orchestrator & interface" },
  { name: "builder", role: "builder", label: "Builder", desc: "Builds digital products" },
  { name: "writer", role: "writer", label: "Writer", desc: "Creates content" },
  { name: "analyst", role: "analyst", label: "Analyst", desc: "Analyzes data" },
]

function formatDate(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

function duration(ms: number): string {
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return "<1m"
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export function DashboardPage() {
  const { getClient, setSidebar } = useStore()
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [summary, setSummary] = useState<TaskSummary[]>([])
  const [activeCount, setActiveCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const client = getClient()
      const [taskRes, summaryRes] = await Promise.all([
        client.getWorkflowTasks(filter ?? undefined),
        client.getWorkflowSummary(),
      ])
      setTasks(taskRes.tasks)
      setSummary(summaryRes.summary)
      setActiveCount(summaryRes.activeCount)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [getClient, filter])

  useEffect(() => { void refresh() }, [refresh])

  const agentTaskCount = (agentName: string): number =>
    tasks.filter((t) => t.agent_name === agentName).length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => setSidebar(true)} className="lg:hidden p-2 rounded-lg text-text-2 hover:text-text hover:bg-bg-3 transition-colors">
            <Menu size={18} />
          </button>
          <span className="font-semibold text-text">Workflow Dashboard</span>
          {activeCount > 0 && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/25 font-mono">
              {activeCount} active
            </span>
          )}
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

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6 max-w-4xl mx-auto w-full">
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-900/20 border border-red-800/40 rounded-xl text-red-400 text-sm">
            <XCircle size={16} />
            {error}
          </div>
        )}

        {/* Team status */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text-2 uppercase tracking-wider px-1">Team</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {TEAM.map((agent) => {
              const RoleIcon = ROLE_ICONS[agent.role] || User
              const roleColor = ROLE_COLORS[agent.role] || ROLE_COLORS.orchestrator
              const count = agentTaskCount(agent.name)
              const agentSummary = summary.find((s) => s.agent === agent.name)
              return (
                <div key={agent.name} className="bg-bg-3 border border-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${roleColor}`}>
                      <RoleIcon size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text">{agent.label}</p>
                      <p className="text-xs text-text-3">{agent.desc}</p>
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs">
                    {agentSummary ? (
                      <>
                        <span className="text-yellow-500 font-mono">{agentSummary.pending} pending</span>
                        <span className="text-blue-500 font-mono">{agentSummary.in_progress} active</span>
                        <span className="text-green-500 font-mono">{agentSummary.completed} done</span>
                      </>
                    ) : (
                      <span className="text-text-3">No tasks</span>
                    )}
                  </div>
                  {count > 0 && (
                    <div className="h-1.5 bg-bg-4 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all"
                        style={{ width: `${Math.min(100, (agentSummary?.completed ?? 0) / Math.max(1, count) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* Task list */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <h2 className="text-sm font-semibold text-text-2 uppercase tracking-wider">Tasks</h2>
            <div className="flex gap-1 ml-auto">
              {[null, "pending", "in_progress", "completed", "failed"].map((s) => (
                <button
                  key={s ?? "all"}
                  onClick={() => setFilter(s)}
                  className={`px-2 py-1 rounded-md text-xs font-mono transition-colors ${
                    filter === s
                      ? "bg-accent/15 text-accent border border-accent/25"
                      : "text-text-3 hover:text-text-2 hover:bg-bg-3"
                  }`}
                >
                  {s ?? "all"}
                </button>
              ))}
            </div>
          </div>

          {loading && tasks.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <RefreshCw size={20} className="animate-spin text-text-3" />
            </div>
          )}

          {!loading && tasks.length === 0 && !error && (
            <div className="bg-bg-3 border border-border rounded-xl p-8 text-center">
              <p className="text-text-3 text-sm">No tasks yet. Assign work via @agent-name [TASK] to get started.</p>
            </div>
          )}

          <div className="space-y-2">
            {tasks.map((task) => {
              const StatusIcon = STATUS_ICONS[task.status] || Clock
              const statusColor = STATUS_COLORS[task.status] || "text-text-3"
              return (
                <div key={task.id} className="bg-bg-3 border border-border rounded-xl p-4 flex items-start gap-3">
                  <StatusIcon size={16} className={`shrink-0 mt-0.5 ${statusColor}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text truncate">{task.title}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-mono border ${
                        task.status === "completed" ? "bg-green-900/20 text-green-400 border-green-800/30" :
                        task.status === "failed" ? "bg-red-900/20 text-red-400 border-red-800/30" :
                        task.status === "in_progress" ? "bg-blue-900/20 text-blue-400 border-blue-800/30" :
                        "bg-yellow-900/20 text-yellow-400 border-yellow-800/30"
                      }`}>{task.status}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-text-3">
                      <span className="font-mono">{task.id}</span>
                      <span>by {task.agent_name}</span>
                      <span>{formatDate(task.assigned_at)}</span>
                      {task.completed_at && (
                        <span>took {duration(task.completed_at - task.assigned_at)}</span>
                      )}
                    </div>
                    {task.summary && (
                      <p className="mt-1.5 text-xs text-text-2 line-clamp-2">{task.summary}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
