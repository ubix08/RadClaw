import { createOpencodeClient } from "@opencode-ai/sdk"
import { ensureDir, readText, writeText } from "../utils/fs"
import { basename, dirname, joinPath, relativePath } from "../utils/path"
import { saveLastChannel } from "../utils/last-channel"
import type { Logger } from "pino"
import { MemoryStore } from "../memory/store"
import { SessionStore } from "./session-store"
import { ProjectStore } from "../store/projects"
import { SourceStore } from "../store/sources"

type AssistantInput = {
  channel: "telegram" | "whatsapp" | "system"
  userID: string
  text: string
  frontendSessionId?: string
}

export type StreamPart =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_use"; name: string; input: unknown; id?: string }
  | { type: "tool_result"; text: string; tool_use_id?: string }

export type StreamEvent =
  | StreamPart
  | { type: "error"; message: string }
  | { type: "done" }

type AssistantOptions = {
  model?: string
  serverUrl?: string
  hostname: string
  port: number
  heartbeatFile: string
  heartbeatIntervalMinutes: number
  projectsFile: string
  workspaceDir: string
}

type OpencodeClient = ReturnType<typeof createOpencodeClient>

type OpencodeRuntime = {
  client: OpencodeClient
  close?: () => Promise<void> | void
}

// Typed wrappers for OpenCode SDK calls — isolates the need for type assertions
function sdkSessionPrompt(
  client: OpencodeClient,
  path: { id: string },
  body: {
    noReply?: boolean
    system?: string
    parts: Array<{ type: string; text: string }>
    model?: { providerID: string; modelID: string }
  },
): Promise<unknown> {
  return client.session.prompt({ path, body } as never)
}

function sdkSessionMessages(client: OpencodeClient, path: { id: string }): Promise<unknown> {
  return client.session.messages({ path } as never)
}

function sdkSessionCreate(client: OpencodeClient, body: { title?: string }, query?: { directory?: string }): Promise<unknown> {
  return client.session.create({ body, ...(query ? { query } : {}) } as never)
}

function sdkSessionStatus(client: OpencodeClient): Promise<unknown> {
  return client.session.status({} as never)
}

function sdkConfigGet(client: OpencodeClient): Promise<unknown> {
  return client.config.get({} as never)
}

function sdkProviderList(client: OpencodeClient): Promise<unknown> {
  return client.provider.list({} as never)
}

function unwrap<T>(value: unknown): T {
  if (value && typeof value === "object" && "data" in (value as Record<string, unknown>)) {
    return (value as { data: T }).data
  }
  return value as T
}

function buildModelConfig(opencodeModel?: string): { providerID: string; modelID: string } | undefined {
  if (!opencodeModel) return undefined
  const [providerID, ...rest] = opencodeModel.split("/")
  if (!providerID || rest.length === 0) return undefined
  return { providerID, modelID: rest.join("/") }
}

async function extractPromptText(result: unknown): Promise<string> {
  const payload = unwrap<Record<string, unknown>>(result)

  const directParts = payload.parts
  if (directParts && typeof directParts === "object" && Symbol.asyncIterator in directParts) {
    const TIMEOUT_MS = 90_000
    try {
      const text = await Promise.race([
        (async () => {
          const chunks: string[] = []
          for await (const part of directParts as AsyncIterable<Record<string, unknown>>) {
            const t = part?.text
            if (typeof t === "string" && t.length > 0) chunks.push(t)
          }
          return chunks.join("").trim()
        })(),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("stream timeout")), TIMEOUT_MS),
        ),
      ])
      if (text) return text
    } catch {
      // stream timeout or error — fall through
    }
  }

  if (Array.isArray(directParts)) {
    const merged = directParts
      .map((p) => (p && typeof p === "object" && typeof (p as { text?: unknown }).text === "string" ? (p as { text: string }).text : ""))
      .join("\n")
      .trim()
    if (merged) return merged
  }

  const message = payload.message
  if (message && typeof message === "object") {
    const msgParts = (message as { parts?: unknown }).parts
    if (Array.isArray(msgParts)) {
      const merged = msgParts
        .map((p) => (p && typeof p === "object" && typeof (p as { text?: unknown }).text === "string" ? (p as { text: string }).text : ""))
        .join("\n")
        .trim()
      if (merged) return merged
    }
  }

  const maybeText = payload.text
  if (typeof maybeText === "string" && maybeText.trim()) return maybeText.trim()

  return "I could not parse the assistant response."
}

type SessionMessage = {
  info?: { id?: string; role?: string }
  parts?: Array<{ type?: string; text?: string }>
}

function toMessages(value: unknown): SessionMessage[] {
  const payload = unwrap<Record<string, unknown>>(value)
  const data = payload.data
  return Array.isArray(data) ? (data as SessionMessage[]) : []
}

function extractTextFromMessage(message: SessionMessage): string {
  const parts = Array.isArray(message.parts) ? message.parts : []
  const text = parts
    .map((part) => (part?.type === "text" && typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim()
  return text
}

function buildRecentContext(messages: SessionMessage[], limit = 6, maxChars = 2000): string {
  const out: string[] = []
  let remaining = maxChars
  for (let i = messages.length - 1; i >= 0 && out.length < limit; i -= 1) {
    const msg = messages[i]
    const role = msg?.info?.role
    if (!role || (role !== "user" && role !== "assistant")) continue
    const text = extractTextFromMessage(msg)
    if (!text) continue
    const snippet = `${role.toUpperCase()}: ${text}`.trim()
    if (snippet.length > remaining) continue
    out.push(snippet)
    remaining -= snippet.length + 1
  }
  return out.reverse().join("\n")
}

function latestAssistantMessage(messages: SessionMessage[]): SessionMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.info?.role === "assistant") return messages[i]
  }
  return null
}

function assistantSignature(message: SessionMessage | null): string {
  if (!message) return ""
  const id = message.info?.id ?? ""
  const text = extractTextFromMessage(message)
  return `${id}::${text}`
}

function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

type IdentityFiles = {
  soul: string
  identity: string
  agents: string
  user: string
  tools: string
}

async function loadIdentityFiles(workspaceDir: string, logger: Logger): Promise<IdentityFiles> {
  const read = async (name: string): Promise<string> => {
    try {
      return await readText(joinPath(workspaceDir, name))
    } catch {
      logger.warn({ file: name }, "identity file not found")
      return `# ${name}\n`
    }
  }
  return {
    soul: await read("SOUL.md"),
    identity: await read("IDENTITY.md"),
    agents: await read("AGENTS.md"),
    user: await read("USER.md"),
    tools: await read("TOOLS.md"),
  }
}

function buildAgentSystemPrompt(identity: IdentityFiles, memory: string, heartbeatIntervalMinutes: number, projects: ProjectStore, sourcesContext?: string): string {
  const active = projects.active()
  const parts: string[] = []

  // Identity files (OpenClaw standard order)
  parts.push(identity.soul)
  parts.push("")
  parts.push(identity.identity)
  parts.push("")
  parts.push(identity.agents)
  parts.push("")
  parts.push(identity.user)
  parts.push("")
  parts.push(identity.tools)

  // Projects
  parts.push("", "## Projects")
  if (active) {
    parts.push(`- Active project: ${active.name} (${active.path})`)
  }
  const all = projects.list()
  if (all.length > 0) {
    parts.push("- Available projects:")
    for (const p of all) {
      const marker = p.name === active?.name ? " *" : "  "
      parts.push(` ${marker} ${p.name}  ${p.path}`)
    }
    parts.push("")
    parts.push("Use /project <name> to switch projects. Spawn sub-agents in the active project directory.")
    parts.push("Projects inside ~/projects/ are auto-discovered on startup.")
  } else {
    parts.push("- No projects configured. Place directories in ~/projects/ to auto-discover, or use /project add <name> <path>.")
  }

  // Heartbeat
  parts.push("", "## Heartbeat")
  parts.push(`Heartbeat interval: ${heartbeatIntervalMinutes} minutes`)
  parts.push("After heartbeat summaries are added, if the user should be informed, call send_channel_message.")
  parts.push("send_channel_message delivers to the last used channel/user.")

  // Sources
  if (sourcesContext) {
    parts.push("", "## Registered Sources", sourcesContext)
    parts.push("", "The above sources are available for reference. The user may refer to them by title or type in conversation.")
  }

  // Memory
  parts.push("", "## Memory", memory)

  return parts.join("\n")
}

async function createRuntime(opts: AssistantOptions): Promise<OpencodeRuntime> {
  const url = opts.serverUrl || `http://${opts.hostname}:${opts.port}`
  return { client: createOpencodeClient({ baseUrl: url }) }
}

export class AssistantCore {
  private runtime?: OpencodeRuntime
  private client?: OpencodeClient
  private readonly modelConfig?: { providerID: string; modelID: string }
  private readonly opts: AssistantOptions
  private readonly projects: ProjectStore
  private readonly sources: SourceStore

  constructor(
    private readonly logger: Logger,
    private readonly memory: MemoryStore,
    private readonly sessions: SessionStore,
    projects: ProjectStore,
    sources: SourceStore,
    opts: AssistantOptions,
  ) {
    this.projects = projects
    this.sources = sources
    this.opts = opts
    this.modelConfig = buildModelConfig(opts.model)
  }

  async init(): Promise<void> {
    await this.setupRuntime()
    await this.memory.init()
    await this.sessions.init()
    await this.projects.init()
    const discovered = await this.projects.discoverProjects()
    if (discovered > 0) {
      this.logger.info({ count: discovered }, "auto-discovered projects from ~/projects/")
    }
  }

  async ask(input: AssistantInput): Promise<string> {
    const startedAt = Date.now()
    const client = this.ensureClient()
    const sessionID = await this.resolveSessionID(input)

    if (input.channel === "telegram" || input.channel === "whatsapp") {
      await saveLastChannel(input.channel, input.userID)
    }

    const memoryContext = await this.memory.readAll()
    const identity = await loadIdentityFiles(this.opts.workspaceDir, this.logger)
    const systemPrompt = buildAgentSystemPrompt(identity, memoryContext, this.opts.heartbeatIntervalMinutes, this.projects, this.sources.formatContext())

    this.logger.info(
      {
        channel: input.channel,
        userID: input.userID,
        sessionID,
        frontendSessionId: input.frontendSessionId,
        textLength: input.text.length,
        memoryContextLength: memoryContext.length,
      },
      "assistant request started",
    )

    let beforeAssistantSig = ""
    try {
      const beforeMessagesResult = await sdkSessionMessages(client, { id: sessionID })
      const beforeMessages = toMessages(beforeMessagesResult)
      beforeAssistantSig = assistantSignature(latestAssistantMessage(beforeMessages))
    } catch (error) {
      this.logger.warn({ error, sessionID }, "assistant preload messages failed")
    }

    let response: unknown
    try {
      response = await sdkSessionPrompt(client, { id: sessionID }, {
        noReply: false,
        system: systemPrompt,
        parts: [{ type: "text", text: input.text }],
        ...(this.modelConfig ? { model: this.modelConfig } : {}),
      })
    } catch (error) {
      this.logger.error({ error, sessionID }, "assistant prompt call failed")
      throw error
    }

    const parsedText = await extractPromptText(response)
    let assistantText = parsedText
    let usedMessagePolling = false

    if (assistantText === "I could not parse the assistant response.") {
      this.logger.warn({ sessionID }, "assistant response parse failed; polling messages")
      const waitedReply = await this.waitForAssistantReply(sessionID, beforeAssistantSig)
      if (waitedReply) {
        assistantText = waitedReply
        usedMessagePolling = true
      }
    }

    if (assistantText === "I could not parse the assistant response.") {
      const diag = await this.buildNoReplyDiagnostic(sessionID)
      this.logger.error(diag, "assistant no-reply diagnostic")
      assistantText = "I did not receive a model reply in time. Please check OpenCode provider auth/model setup."
    }

    // Track message count for frontend sessions
    if (input.frontendSessionId) {
      await this.sessions.incrementMessageCount(input.frontendSessionId)
    }

    this.logger.info(
      {
        channel: input.channel,
        userID: input.userID,
        sessionID,
        frontendSessionId: input.frontendSessionId,
        durationMs: Date.now() - startedAt,
        usedMessagePolling,
        answerLength: assistantText.length,
      },
      "assistant request completed",
    )

    return assistantText
  }

  async *askStream(input: AssistantInput): AsyncGenerator<StreamEvent, void, void> {
    const client = this.ensureClient()
    const sessionID = await this.resolveSessionID(input)

    if (input.channel === "telegram" || input.channel === "whatsapp") {
      await saveLastChannel(input.channel, input.userID)
    }

    const memoryContext = await this.memory.readAll()
    const identity = await loadIdentityFiles(this.opts.workspaceDir, this.logger)
    const systemPrompt = buildAgentSystemPrompt(identity, memoryContext, this.opts.heartbeatIntervalMinutes, this.projects, this.sources.formatContext())

    this.logger.info(
      {
        channel: input.channel,
        userID: input.userID,
        sessionID,
        frontendSessionId: input.frontendSessionId,
        textLength: input.text.length,
      },
      "assistant stream request started",
    )

    let response: unknown
    try {
      response = await sdkSessionPrompt(client, { id: sessionID }, {
        noReply: false,
        system: systemPrompt,
        parts: [{ type: "text", text: input.text }],
        ...(this.modelConfig ? { model: this.modelConfig } : {}),
      })
    } catch (error) {
      this.logger.error({ error, sessionID }, "assistant stream prompt call failed")
      yield { type: "error", message: (error as Error).message }
      return
    }

    const payload = unwrap<Record<string, unknown>>(response)
    const parts = payload.parts

    let gotContent = false
    if (parts && typeof parts === "object" && Symbol.asyncIterator in parts) {
      try {
        for await (const part of parts as AsyncIterable<Record<string, unknown>>) {
          const ptype = part?.type
          if (typeof ptype === "string") {
            if (ptype === "text" || ptype === "thinking" || ptype === "tool_use" || ptype === "tool_result") {
              gotContent = true
              yield part as unknown as StreamEvent
            } else if (part?.text) {
              gotContent = true
              yield { type: "text", text: part.text as string } as StreamEvent
            }
          }
        }
      } catch (e) {
        this.logger.error({ error: e, sessionID }, "assistant stream part iteration error")
        yield { type: "error", message: (e as Error).message }
        return
      }
    }

    if (!gotContent) {
      const text = await extractPromptText(response)
      if (text && text !== "I could not parse the assistant response.") {
        yield { type: "text", text }
      } else {
        this.logger.warn({ sessionID }, "assistant stream response parse failed; polling messages")
        let beforeAssistantSig = ""
        try {
          const beforeMessagesResult = await sdkSessionMessages(client, { id: sessionID })
          beforeAssistantSig = assistantSignature(latestAssistantMessage(toMessages(beforeMessagesResult)))
        } catch { /* ignore */ }
        const waitedReply = await this.waitForAssistantReply(sessionID, beforeAssistantSig)
        if (waitedReply) {
          yield { type: "text", text: waitedReply }
        } else {
          yield { type: "error", message: "I did not receive a model reply in time. Please check OpenCode provider auth/model setup." }
          return
        }
      }
    }

    if (input.frontendSessionId) {
      await this.sessions.incrementMessageCount(input.frontendSessionId)
    }

    this.logger.info(
      {
        channel: input.channel,
        userID: input.userID,
        sessionID,
        frontendSessionId: input.frontendSessionId,
      },
      "assistant stream request completed",
    )

    yield { type: "done" }
  }

  async startNewMainSession(reason = "manual"): Promise<string> {
    const dir = this.projects.active()?.path
    const sessionID = await this.createSession(`main:${reason}`, dir)
    await this.sessions.setMainSessionID(sessionID)
    this.logger.info({ sessionID, reason, directory: dir }, "created new main session")
    return sessionID
  }

  async remember(note: string, source: string): Promise<void> {
    await this.memory.append(note, source)
  }

  // ── project management ──────────────────────────────────────────────────

  listProjects() {
    return this.projects.list()
  }

  activeProject() {
    return this.projects.active()
  }

  async setActiveProject(name: string): Promise<string> {
    const project = await this.projects.setActive(name)
    await this.startNewMainSession(`project:${name}`)
    return `Switched to project "${project.name}" (${project.path}). New session started.`
  }

  async addProject(name: string, path: string): Promise<string> {
    const project = await this.projects.add(name, path)
    return `Added project "${project.name}" at ${project.path}.`
  }

  async removeProject(name: string): Promise<string> {
    await this.projects.remove(name)
    return `Removed project "${name}".`
  }

  projectListText(): string {
    return this.projects.formatList()
  }

  async heartbeatTaskStatus(): Promise<{ file: string; taskCount: number; empty: boolean }> {
    const file = this.opts.heartbeatFile
    const tasks = await this.loadHeartbeatTasks()
    return { file: relativePath(Bun.cwd, file) || basename(file), taskCount: tasks.length, empty: tasks.length === 0 }
  }

  async runHeartbeatTasks(): Promise<string> {
    const startedAt = Date.now()
    const tasks = await this.loadHeartbeatTasks()
    if (tasks.length === 0) {
      return "Heartbeat skipped: heartbeat.md has no tasks."
    }

    const heartbeatSessionID = await this.getOrCreateHeartbeatSession()
    const mainSessionID = await this.getOrCreateMainSession()
    this.logger.info({ heartbeatSessionID, mainSessionID, taskCount: tasks.length }, "heartbeat sessions ready")
    const client = this.ensureClient()

    const memoryContext = await this.memory.readAll()
    const identity = await loadIdentityFiles(this.opts.workspaceDir, this.logger)
    const systemPrompt = buildAgentSystemPrompt(identity, memoryContext, this.opts.heartbeatIntervalMinutes, this.projects, this.sources.formatContext())

    let recentContext = ""
    try {
      const mainMessagesResult = await sdkSessionMessages(client, { id: mainSessionID })
      recentContext = buildRecentContext(toMessages(mainMessagesResult))
    } catch (error) {
      this.logger.warn({ error, mainSessionID }, "heartbeat main-session context load failed")
    }

    let beforeAssistantSig = ""
    try {
      const beforeMessagesResult = await sdkSessionMessages(client, { id: heartbeatSessionID })
      beforeAssistantSig = assistantSignature(latestAssistantMessage(toMessages(beforeMessagesResult)))
    } catch (error) {
      this.logger.warn({ error, heartbeatSessionID }, "heartbeat preload messages failed")
    }
    const prompt = [
      "Run these recurring cron tasks for the project.",
      "Return concise actionable bullet points with findings and next actions.",
      "This is routine task execution, not a healthcheck.",
      "If nothing requires action, explicitly say no action is needed.",
      "",
      recentContext ? "Recent main session context:" : "",
      recentContext,
      recentContext ? "" : "",
      "Task list:",
      ...tasks.map((t, i) => `${i + 1}. ${t}`),
    ].join("\n")

    let response: unknown
    try {
      response = await sdkSessionPrompt(client, { id: heartbeatSessionID }, {
        noReply: false,
        system: systemPrompt,
        parts: [{ type: "text", text: prompt }],
        ...(this.modelConfig ? { model: this.modelConfig } : {}),
      })
    } catch (error) {
      this.logger.error({ error, heartbeatSessionID }, "heartbeat prompt call failed")
      throw error
    }

    let summary = await extractPromptText(response)
    if (summary === "I could not parse the assistant response.") {
      this.logger.warn({ heartbeatSessionID }, "heartbeat response parse failed; polling messages")
      summary = (await this.waitForAssistantReply(heartbeatSessionID, beforeAssistantSig)) ?? ""
    }
    if (!summary) {
      return "Heartbeat failed: no summary reply from model."
    }

    try {
      await sdkSessionPrompt(client, { id: mainSessionID }, {
        noReply: true,
        parts: [{ type: "text", text: `[Heartbeat summary]\n${summary}` }],
        ...(this.modelConfig ? { model: this.modelConfig } : {}),
      })
    } catch (error) {
      this.logger.error({ error, mainSessionID }, "heartbeat summary injection failed")
      throw error
    }

    try {
      await sdkSessionPrompt(client, { id: mainSessionID }, {
        noReply: false,
        parts: [
          {
            type: "text",
            text: [
              "Heartbeat summary was added to context.",
              "Decide whether the user should be proactively informed now.",
              "If yes, call send_channel_message with a concise plain-text message.",
              "If not needed, do nothing.",
            ].join("\n"),
          },
        ],
        ...(this.modelConfig ? { model: this.modelConfig } : {}),
      })
    } catch (error) {
      this.logger.error({ error, mainSessionID }, "heartbeat notify prompt failed")
      throw error
    }

    this.logger.info({ heartbeatSessionID, mainSessionID, taskCount: tasks.length, durationMs: Date.now() - startedAt }, "heartbeat task run complete")
    return `Heartbeat completed with ${tasks.length} tasks.`
  }

  async close(): Promise<void> {
    if (typeof this.runtime?.close === "function") {
      await this.runtime.close()
    }
  }

  // ── Frontend session management ────────────────────────────────────────

  /** Resolve which OpenCode session to use for a given input. */
  private async resolveSessionID(input: AssistantInput): Promise<string> {
    if (input.frontendSessionId) {
      return this.getOrCreateFrontendSession(input.frontendSessionId)
    }
    return this.getOrCreateMainSession()
  }

  /** Get or create an OpenCode session for a frontend session ID. */
  async getOrCreateFrontendSession(frontendId: string): Promise<string> {
    const existing = this.sessions.getFrontendSession(frontendId)
    if (existing) return existing

    const dir = this.projects.active()?.path
    const opencodeId = await this.createSession(`frontend:${frontendId.slice(0, 20)}`, dir)
    await this.sessions.setFrontendSession(frontendId, opencodeId)
    return opencodeId
  }

  /** Remove a frontend session mapping and return whether it existed. */
  async deleteFrontendSession(frontendId: string): Promise<boolean> {
    return this.sessions.removeFrontendSession(frontendId)
  }

  /** List all frontend sessions with metadata (no message bodies). */
  listFrontendSessions() {
    return this.sessions.listFrontendSessions()
  }

  private async createSession(key: string, directory?: string): Promise<string> {
    const client = this.ensureClient()
    const session = await sdkSessionCreate(client, { title: `chat:${key}` }, directory ? { directory } : undefined)

    const payload = unwrap<Record<string, unknown>>(session)
    const id = payload.id
    if (typeof id !== "string" || id.length === 0) {
      throw new Error("Failed to create session: missing id")
    }

    this.logger.info({ key, sessionID: id }, "created OpenCode session")
    return id
  }

  private async getOrCreateMainSession(): Promise<string> {
    const existing = this.sessions.getMainSessionID()
    if (existing) return existing
    const dir = this.projects.active()?.path
    const created = await this.createSession("main", dir)
    await this.sessions.setMainSessionID(created)
    return created
  }

  private async getOrCreateHeartbeatSession(): Promise<string> {
    const existing = this.sessions.getHeartbeatSessionID()
    if (existing) return existing
    const dir = this.projects.active()?.path
    const created = await this.createSession("heartbeat", dir)
    await this.sessions.setHeartbeatSessionID(created)
    return created
  }

  private async waitForAssistantReply(sessionID: string, beforeAssistantSig: string): Promise<string | null> {
    const timeoutMs = 60_000
    const intervalMs = 700
    const endAt = Date.now() + timeoutMs
    let pollCount = 0

    while (Date.now() < endAt) {
      pollCount += 1
      try {
        const messagesResult = await sdkSessionMessages(this.ensureClient(), { id: sessionID })
        const messages = toMessages(messagesResult)
        const latestAssistant = latestAssistantMessage(messages)
        const nextSig = assistantSignature(latestAssistant)
        if (latestAssistant && nextSig !== beforeAssistantSig) {
          const text = extractTextFromMessage(latestAssistant)
          if (text.length > 0) return text
        }
        if (pollCount % 5 === 0) {
          this.logger.info(
            { sessionID, pollCount, currentCount: messages.length },
            "waiting for assistant reply",
          )
        }
      } catch (error) {
        this.logger.warn({ error, sessionID, pollCount }, "polling assistant reply failed")
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }

    this.logger.warn({ sessionID, timeoutMs }, "assistant reply polling timed out")
    return null
  }

  private async buildNoReplyDiagnostic(sessionID: string): Promise<Record<string, unknown>> {
    const client = this.ensureClient()
    const out: Record<string, unknown> = { sessionID }

    try {
      const statusResult = await sdkSessionStatus(client)
      const statusData = unwrap<Record<string, unknown>>(statusResult)
      out.sessionStatus = statusData[sessionID] ?? null
    } catch (error) {
      out.sessionStatusError = error instanceof Error ? error.message : String(error)
    }

    try {
      const configResult = await sdkConfigGet(client)
      const config = unwrap<Record<string, unknown>>(configResult)
      out.configModel = safeString(config.model) ?? null
    } catch (error) {
      out.configError = error instanceof Error ? error.message : String(error)
    }

    try {
      const providers = await sdkProviderList(client)
      const providerData = unwrap<Record<string, unknown>>(providers)
      out.connectedProviders = Array.isArray(providerData.connected) ? providerData.connected : []
      out.defaultProviders = providerData.default ?? null
    } catch (error) {
      out.providerError = error instanceof Error ? error.message : String(error)
    }

    try {
      const msgs = await sdkSessionMessages(client, { id: sessionID })
      const list = toMessages(msgs)
      out.messageCount = list.length
      out.lastRole = list.length > 0 ? list[list.length - 1]?.info?.role ?? null : null
    } catch (error) {
      out.messagesError = error instanceof Error ? error.message : String(error)
    }

    return out
  }

  private async setupRuntime(): Promise<void> {
    if (this.client) return
    this.runtime = await createRuntime(this.opts)
    this.client = this.runtime.client
  }

  private ensureClient(): OpencodeClient {
    if (!this.client) {
      throw new Error("AssistantCore is not initialized. Call init() before ask()/heartbeat().")
    }
    return this.client
  }

  private async loadHeartbeatTasks(): Promise<string[]> {
    const file = this.opts.heartbeatFile
    await ensureDir(dirname(file))
    try {
      await readText(file)
    } catch {
      await writeText(file, "")
      return []
    }

    const content = await readText(file)
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((line) => line.replace(/^[-*]\s+/, ""))
      .filter((line) => line.length > 0)
  }

}
