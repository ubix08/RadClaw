import { ensureDir, readJson, writeJson } from "../utils/fs"
import { dirname } from "../utils/path"

export type FrontendSessionMeta = {
  opencodeId: string
  messageCount: number
  createdAt: number
}

type SessionData = {
  mainSessionID?: string
  heartbeatSessionID?: string
  /** Frontend session ID → OpenCode session mapping */
  sessions: Record<string, FrontendSessionMeta>
}

export class SessionStore {
  private cache: SessionData = { sessions: {} }

  constructor(private readonly filePath: string) {}

  async init(): Promise<void> {
    await ensureDir(dirname(this.filePath))
    try {
      const obj = await readJson<SessionData>(this.filePath)
      this.cache = {
        mainSessionID: typeof obj.mainSessionID === "string" ? obj.mainSessionID : undefined,
        heartbeatSessionID: typeof obj.heartbeatSessionID === "string" ? obj.heartbeatSessionID : undefined,
        sessions: obj.sessions && typeof obj.sessions === "object" ? obj.sessions : {},
      }
    } catch {
      await this.persist()
    }
  }

  getMainSessionID(): string | undefined {
    return this.cache.mainSessionID
  }

  async setMainSessionID(sessionID: string): Promise<void> {
    this.cache.mainSessionID = sessionID
    await this.persist()
  }

  getHeartbeatSessionID(): string | undefined {
    return this.cache.heartbeatSessionID
  }

  async setHeartbeatSessionID(sessionID: string): Promise<void> {
    this.cache.heartbeatSessionID = sessionID
    await this.persist()
  }

  // ── Frontend session mapping ──────────────────────────────────────────

  /** Get the OpenCode session ID for a frontend session, if one exists. */
  getFrontendSession(frontendId: string): string | undefined {
    return this.cache.sessions[frontendId]?.opencodeId
  }

  /** Get metadata for a frontend session. */
  getFrontendSessionMeta(frontendId: string): FrontendSessionMeta | undefined {
    return this.cache.sessions[frontendId]
  }

  /** Register a frontend session → OpenCode session mapping. */
  async setFrontendSession(frontendId: string, opencodeId: string): Promise<void> {
    this.cache.sessions[frontendId] = {
      opencodeId,
      messageCount: 0,
      createdAt: Date.now(),
    }
    await this.persist()
  }

  /** Increment the message count for a frontend session. */
  async incrementMessageCount(frontendId: string, by = 2): Promise<void> {
    const existing = this.cache.sessions[frontendId]
    if (existing) {
      existing.messageCount += by
      await this.persist()
    }
  }

  /** Remove a frontend session mapping. */
  async removeFrontendSession(frontendId: string): Promise<boolean> {
    if (!this.cache.sessions[frontendId]) return false
    delete this.cache.sessions[frontendId]
    await this.persist()
    return true
  }

  /** List all frontend sessions with metadata. */
  listFrontendSessions(): Array<{ frontendId: string } & FrontendSessionMeta> {
    return Object.entries(this.cache.sessions).map(([frontendId, meta]) => ({
      frontendId,
      ...meta,
    }))
  }

  /** Total number of tracked frontend sessions. */
  frontendSessionCount(): number {
    return Object.keys(this.cache.sessions).length
  }

  private async persist(): Promise<void> {
    await writeJson(this.filePath, this.cache)
  }
}
