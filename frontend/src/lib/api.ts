import type { AdminStatus, HeartbeatStatus, MemoryEntry, ServerConfig, WhitelistData } from "../types"

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

  async chat(text: string, userID: string): Promise<{ reply: string; userID: string }> {
    return this.post("/api/chat", { text, userID }, this.chatKey)
  }

  streamChat(
    text: string,
    userID: string,
    onToken: (chunk: string, accumulated: string) => void,
    onDone: (reply: string) => void,
    onError: (msg: string, accumulated?: string) => void,
  ): AbortController {
    const ctrl = new AbortController()

    const run = async () => {
      let accumulated = ""
      try {
        const res = await fetch(`${this.base}/api/chat/stream`, {
          method: "POST",
          headers: this.headers(this.chatKey),
          body: JSON.stringify({ text, userID }),
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
              onError("Failed to parse server event", accumulated)
              return
            }

            if (event === "token") {
              accumulated = data.accumulated as string
              onToken(data.chunk as string, accumulated)
            }
            if (event === "done")  { onDone(data.reply as string); return }
            if (event === "error") { onError(data.message as string, accumulated); return }
          }
        }

        if (accumulated) {
          onDone(accumulated)
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") onError((e as Error).message, accumulated)
      }
    }

    void run()
    return ctrl
  }

  async newSession(): Promise<{ sessionID: string }> {
    return this.post("/api/chat/new", {}, this.chatKey)
  }

  async uploadFile(file: File): Promise<{ name: string; text: string; size: number }> {
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

  // ── config ────────────────────────────────────────────────────────────────

  async getConfig(): Promise<{ config: ServerConfig }> {
    return this.get("/api/admin/config", this.adminKey)
  }

  async updateConfig(updates: Record<string, string>): Promise<{ config: Record<string, string> }> {
    return this.post("/api/admin/config", { updates }, this.adminKey)
  }
}
