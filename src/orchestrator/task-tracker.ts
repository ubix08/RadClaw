import { Database } from "bun:sqlite"
import type { SQLQueryBindings } from "bun:sqlite"
import type { TaskRecord, TaskStatus } from "./types"

export class TaskTracker {
  private db: Database
  private counters = new Map<string, number>()

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        agent_name TEXT NOT NULL,
        title TEXT NOT NULL,
        parent_task_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        assigned_at INTEGER NOT NULL,
        completed_at INTEGER,
        output_path TEXT,
        summary TEXT
      )
    `)
  }

  private nextId(agentName: string): string {
    const c = (this.counters.get(agentName) ?? 0) + 1
    this.counters.set(agentName, c)
    return `${agentName}-${String(c).padStart(3, "0")}`
  }

  create(agentName: string, title: string, parentTaskId?: string): string {
    const id = this.nextId(agentName)
    const now = Date.now()
    this.db.run(
      `INSERT INTO tasks (id, agent_name, title, parent_task_id, status, assigned_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [id, agentName, title, parentTaskId ?? null, now],
    )
    return id
  }

  updateStatus(id: string, status: TaskStatus, extra?: { outputPath?: string; summary?: string }): void {
    const sets: string[] = ["status = ?"]
    const params: SQLQueryBindings[] = [status]
    if (extra?.outputPath) { sets.push("output_path = ?"); params.push(extra.outputPath) }
    if (extra?.summary) { sets.push("summary = ?"); params.push(extra.summary) }
    if (status === "completed" || status === "failed") { sets.push("completed_at = ?"); params.push(Date.now()) }
    params.push(id)
    this.db.run(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`, params)
  }

  list(status?: TaskStatus): TaskRecord[] {
    if (status) {
      return this.db.query("SELECT * FROM tasks WHERE status = ? ORDER BY assigned_at DESC").all(status) as TaskRecord[]
    }
    return this.db.query("SELECT * FROM tasks ORDER BY assigned_at DESC").all() as TaskRecord[]
  }

  get(id: string): TaskRecord | null {
    return this.db.query("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRecord | null
  }

  activeCount(): number {
    const r = this.db.query("SELECT COUNT(*) as c FROM tasks WHERE status IN ('pending', 'in_progress')").get() as { c: number }
    return r.c
  }

  summary(): { agent: string; pending: number; in_progress: number; completed: number }[] {
    return this.db.query(`
      SELECT agent_name as agent,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM tasks GROUP BY agent_name
    `).all() as { agent: string; pending: number; in_progress: number; completed: number }[]
  }
}
