import type { AdminStatus, BackendSession, HeartbeatStatus, MemoryEntry, MessagePart, ServerConfig, Source, SourceType, UploadResult, WhitelistData } from "../types"

export class ApiClient {
  private base: string
  private chatKey: string
  private adminKey: string

  constructor(base: string, chatKey: string, adminKey: string) {
    this.base     = base.replace(/\/$/, "")
    this.chatKey  = chatKey || adminKey
    this.adminKey = adminKey
  }

  private headers(key: string): HeadersInit {
    const h: Record<string, string> = { "Content-Type": "application/json" }
    if (key) h["Authorization"] = `Bearer ${key}`
    return h
  }

  private async del<T>(path: string, key: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: "DELETE",
      headers: this.headers(key),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error((err as { error?: string }).error ?? res.statusText)
    }
    return res.json()
  }

  private async post<T>(path: string, body: unknown, key: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: this.headers(key),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error((err as { error?: string }).error ?? res.statusText)
    }
    return res.json()
  }

  private async get<T>(path: string, key: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      headers: this.headers(key),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error((err as { error?: string }).error ?? res.statusText)
    }
    return res.json()
  }

  // ── chat ──────────────────────────────────────────────────────────────────

  async chat(text: string, userID: string, sessionID?: string): Promise<{ reply: string; userID: string }> {
    return this.post("/api/chat", { text, userID, sessionID }, this.chatKey)
  }

  streamChat(
    text: string,
    userID: string,
    sessionID: string | undefined,
    onPart: (part: MessagePart) => void,
    onDone: () => void,
    onError: (msg: string) => void,
  ): AbortController {
    const ctrl = new AbortController()

    const run = async () => {
      try {
        const res = await fetch(`${this.base}/api/chat/stream`, {
          method: "POST",
          headers: this.headers(this.chatKey),
          body: JSON.stringify({ text, userID, sessionID }),
          signal: ctrl.signal,
        })
        if (!res.ok || !res.body) {
          onError(`HTTP ${res.status}`)
          return
        }
        const reader  = res.body.getReader()
        const decoder = new TextDecoder()
        let   buf     = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })

          const parts = buf.split("\n\n")
          buf = parts.pop() ?? ""

          for (const part of parts) {
            const eventLine = part.split("\n").find(l => l.startsWith("event: "))
            const dataLine  = part.split("\n").find(l => l.startsWith("data: "))
            if (!eventLine || !dataLine) continue

            const event = eventLine.slice(7).trim()
            let data: Record<string, unknown>
            try {
              data = JSON.parse(dataLine.slice(5))
            } catch {
              onError("Failed to parse server event")
              return
            }

            switch (event) {
              case "text":
              case "thinking":
              case "tool_use":
              case "tool_result":
                onPart(data as MessagePart)
                break
              case "done":
                onDone()
                return
              case "error":
                onError((data.message as string) ?? "Server error")
                return
            }
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") onError((e as Error).message)
      }
    }

    void run()
    return ctrl
  }

  async newSession(): Promise<{ sessionID: string }> {
    return this.post("/api/chat/new", {}, this.chatKey)
  }

  async uploadFile(file: File): Promise<UploadResult> {
    const form = new FormData()
    form.append("file", file)
    const h: Record<string, string> = {}
    if (this.chatKey) h["Authorization"] = `Bearer ${this.chatKey}`
    const res = await fetch(`${this.base}/api/chat/upload`, {
      method: "POST",
      headers: h,
      body: form,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error((err as { error?: string }).error ?? res.statusText)
    }
    return res.json()
  }

  // ── admin ─────────────────────────────────────────────────────────────────

  async adminStatus(): Promise<AdminStatus> {
    return this.get("/api/admin/status", this.adminKey)
  }

  async heartbeatStatus(): Promise<HeartbeatStatus> {
    return this.get("/api/heartbeat/status", this.adminKey)
  }

  async runHeartbeat(): Promise<{ result: string }> {
    return this.post("/api/heartbeat/run", {}, this.adminKey)
  }

  // ── memory ────────────────────────────────────────────────────────────────

  async getMemory(): Promise<MemoryEntry> {
    return this.get("/api/memory", this.adminKey)
  }

  async addMemory(note: string, source?: string): Promise<{ ok: boolean }> {
    return this.post("/api/memory", { note, source }, this.adminKey)
  }

  // ── whitelist ─────────────────────────────────────────────────────────────

  async addWhitelist(channel: "telegram" | "whatsapp", userID: string): Promise<{ created: boolean }> {
    return this.post("/api/whitelist", { channel, userID }, this.adminKey)
  }

  async getWhitelist(): Promise<WhitelistData> {
    return this.get("/api/whitelist", this.adminKey)
  }

  // ── sessions (frontend multi-session) ─────────────────────────────────

  async listSessions(): Promise<{ sessions: BackendSession[] }> {
    return this.get("/api/sessions", this.chatKey)
  }

  async deleteBackendSession(frontendId: string): Promise<{ removed: boolean }> {
    return this.del(`/api/sessions/${encodeURIComponent(frontendId)}`, this.adminKey)
  }

  // ── config ────────────────────────────────────────────────────────────────

  async getConfig(): Promise<{ config: ServerConfig }> {
    return this.get("/api/admin/config", this.adminKey)
  }

  async updateConfig(updates: Record<string, string>): Promise<{ config: Record<string, string> }> {
    return this.post("/api/admin/config", { updates }, this.adminKey)
  }

  // ── sources ────────────────────────────────────────────────────────────────

  async getSources(): Promise<{ sources: Source[] }> {
    return this.get("/api/sources", this.adminKey)
  }

  async addSource(data: { type: SourceType; title: string; url?: string; content?: string }): Promise<{ source: Source }> {
    return this.post("/api/sources", data, this.adminKey)
  }

  async deleteSource(id: string): Promise<{ removed: boolean }> {
    return this.del(`/api/sources/${encodeURIComponent(id)}`, this.adminKey)
  }

  // ── workflow ─────────────────────────────────────────────────────────────

  async getWorkflowTasks(status?: string): Promise<{ tasks: import("../types").TaskRecord[] }> {
    const path = status ? `/api/workflow/tasks/${status}` : "/api/workflow/tasks"
    return this.get(path, this.adminKey)
  }

  async getWorkflowSummary(): Promise<{ summary: import("../types").TaskSummary[]; activeCount: number }> {
    return this.get("/api/workflow/summary", this.adminKey)
  }

  async getWorkflowTask(id: string): Promise<{ task: import("../types").TaskRecord }> {
    return this.get(`/api/workflow/task/${encodeURIComponent(id)}`, this.adminKey)
  }
}
