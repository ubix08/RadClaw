/**
 * channels/api.ts
 *
 * HTTP API channel for RadClaw — REST + SSE interface consumed by the
 * React frontend (and any HTTP client).
 *
 * Endpoints
 * ─────────
 * Chat
 *   POST   /api/chat              – send message, get full reply
 *   POST   /api/chat/stream       – send message, get SSE token stream
 *   POST   /api/chat/new          – start a fresh main session
 *   POST   /api/chat/upload       – upload a file, get extracted text
 *   GET    /api/chat/history      – memory-backed recent context
 *
 * Memory
 *   GET    /api/memory            – read all memory entries
 *   POST   /api/memory            – append a memory note
 *
 * Admin
 *   GET    /api/admin/status      – health + uptime
 *   GET    /api/admin/config      – read server env config
 *   POST   /api/admin/config      – update server env config
 *   POST   /api/whitelist         – add user to whitelist
 *   GET    /api/whitelist         – list whitelisted users
 *   GET    /api/heartbeat/status  – heartbeat task info
 *   POST   /api/heartbeat/run     – manual heartbeat trigger
 *
 * Auth: Bearer token via API_ADMIN_KEY / API_CHAT_KEY env vars.
 *       Set API_ENABLE_AUTH=false to disable (dev only).
 */

import type { Logger } from "pino"
import type { AssistantCore } from "../core/assistant"
import type { WhitelistStore } from "../core/whitelist-store"
import type { MemoryStore } from "../memory/store"
import { readEnv, writeEnv } from "../utils/env"
import { ensureDir, readJson, writeBinary } from "../utils/fs"
import { dirname, joinPath } from "../utils/path"
import { randomUUID } from "node:crypto"

export type ApiAdapterOptions = {
  logger: Logger
  assistant: AssistantCore
  whitelist: WhitelistStore
  memory: MemoryStore
  hostname?: string
  port?: number
  adminKey?: string
  chatKey?: string
  enableAuth?: boolean
  corsOrigin?: string
  uploadsDir: string
}

// ── tiny router ───────────────────────────────────────────────────────────────

type Handler = (req: Request, params: Record<string, string>) => Promise<Response>
type Route = { method: string; pattern: RegExp; keys: string[]; handler: Handler }

function compilePath(path: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = []
  const src = path
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // escape regex chars first
    .replace(/\\:([^/]+)/g, (_m, k) => { keys.push(k); return "([^/]+)" })
    // redo: don't double-escape the colon segments
  // simpler approach:
  const keys2: string[] = []
  const src2 = path.replace(/:([^/]+)/g, (_m, k) => { keys2.push(k); return "([^/]+)" })
  return { pattern: new RegExp(`^${src2}$`), keys: keys2 }
}

class Router {
  private routes: Route[] = []
  add(method: string, path: string, handler: Handler) {
    const { pattern, keys } = compilePath(path)
    this.routes.push({ method, pattern, keys, handler })
  }
  match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | null {
    for (const r of this.routes) {
      if (r.method !== method && r.method !== "*") continue
      const m = pathname.match(r.pattern)
      if (!m) continue
      const params: Record<string, string> = {}
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]) })
      return { handler: r.handler, params }
    }
    return null
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })

const apiErr = (msg: string, status = 400) => json({ error: msg }, status)

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
  "X-Accel-Buffering": "no",
}

const sseFrame = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  }
}

function addCors(response: Response, cors: Record<string, string>): Response {
  const headers = new Headers(response.headers)
  for (const [k, v] of Object.entries(cors)) headers.set(k, v)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function makeAuth(enabled: boolean, key: string | undefined) {
  return (req: Request) => {
    if (!enabled) return true
    if (!key) return false
    return (req.headers.get("Authorization") ?? "") === `Bearer ${key}`
  }
}

// ── adapter ───────────────────────────────────────────────────────────────────

export async function startApiAdapter(opts: ApiAdapterOptions): Promise<void> {
  const {
    logger,
    assistant,
    whitelist,
    memory,
    hostname = "0.0.0.0",
    port = 3100,
    adminKey,
    chatKey,
    enableAuth = true,
    corsOrigin = "*",
  } = opts

  const cors = corsHeaders(corsOrigin)
  const authAdmin = makeAuth(enableAuth, adminKey)
  if (enableAuth && !chatKey) {
    logger.warn("API_CHAT_KEY not set — chat endpoints require authentication but no chat-specific key is configured. " +
      "Set API_CHAT_KEY explicitly, or disable auth via API_ENABLE_AUTH=false (dev only).")
  }
  const authChat  = makeAuth(enableAuth, chatKey ?? adminKey)
  const router    = new Router()

  // ── chat ─────────────────────────────────────────────────────────────────

  /** POST /api/chat  → { reply, userID } */
  router.add("POST", "/api/chat", async (req) => {
    if (!authChat(req)) return apiErr("Unauthorized", 401)
    let body: { text?: string; userID?: string; sessionID?: string }
    try { body = await req.json() } catch { return apiErr("Invalid JSON") }
    if (!body.text?.trim()) return apiErr("text is required")
    const userID = (body.userID ?? "web:anonymous").trim()
    try {
      const reply = await assistant.ask({
        channel: "system",
        userID,
        text: body.text.trim(),
        frontendSessionId: body.sessionID?.trim() || undefined,
      })
      return json({ reply, userID })
    } catch (e) {
      logger.error({ e }, "api /chat error")
      return apiErr("Internal error", 500)
    }
  })

  /** POST /api/chat/stream  → SSE: text|thinking|tool_use|tool_result|done|error */
  router.add("POST", "/api/chat/stream", async (req) => {
    if (!authChat(req)) return apiErr("Unauthorized", 401)
    let body: { text?: string; userID?: string; sessionID?: string }
    try { body = await req.json() } catch { return apiErr("Invalid JSON") }
    if (!body.text?.trim()) return apiErr("text is required")
    const userID    = (body.userID ?? "web:anonymous").trim()
    const text      = body.text.trim()
    const sessionID = body.sessionID?.trim() || undefined

    const stream = new ReadableStream({
      async start(ctrl) {
        const enc  = new TextEncoder()
        const emit = (evt: string, data: unknown) =>
          ctrl.enqueue(enc.encode(sseFrame(evt, data)))

        try {
          for await (const event of assistant.askStream({
            channel: "system",
            userID,
            text,
            frontendSessionId: sessionID,
          })) {
            if (event.type === "done") {
              emit("done", {})
            } else if (event.type === "error") {
              emit("error", { message: event.message })
            } else {
              emit(event.type, event)
            }
          }
        } catch (e) {
          emit("error", { message: e instanceof Error ? e.message : "Internal error" })
        } finally {
          ctrl.close()
        }
      },
    })

    return new Response(stream, { status: 200, headers: { ...cors, ...SSE_HEADERS } })
  })

  /** POST /api/chat/new  → { sessionID } */
  router.add("POST", "/api/chat/new", async (req) => {
    if (!authChat(req)) return apiErr("Unauthorized", 401)
    try {
      const sessionID = await assistant.startNewMainSession("web")
      return json({ sessionID })
    } catch (e) {
      logger.error({ e }, "api /chat/new error")
      return apiErr("Internal error", 500)
    }
  })

  const UPLOADS_DIR = opts.uploadsDir

  const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"])
  const SPREADSHEET_EXTS = new Set([".csv", ".tsv", ".xls", ".xlsx", ".ods"])
  const TEXT_EXTS = new Set([
    ".txt", ".md", ".mdx",
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts",
    ".py", ".rb", ".go", ".rs", ".java", ".kt", ".scala",
    ".c", ".h", ".cpp", ".hpp", ".cs", ".swift",
    ".json", ".yaml", ".yml", ".xml", ".toml", ".ini", ".cfg", ".conf",
    ".html", ".css", ".scss", ".less", ".sass",
    ".sh", ".bash", ".zsh", ".fish",
    ".sql", ".r", ".lua", ".php", ".pl",
    ".vim", ".env", ".gitignore", ".dockerfile",
    ".graphql", ".gql", ".proto",
    ".log", ".diff", ".patch",
    ".pdf",
  ])

  const ALLOWED_EXTS = new Set([...IMAGE_EXTS, ...SPREADSHEET_EXTS, ...TEXT_EXTS])

  function isLikelyBinary(buf: Uint8Array): boolean {
    if (buf.length === 0) return false
    const limit = Math.min(buf.length, 4096)
    let nulls = 0
    for (let i = 0; i < limit; i++) {
      if (buf[i] === 0) nulls++
    }
    return nulls / limit >= 0.05
  }

  type UploadResult = {
    name: string
    size: number
    type: "text" | "image" | "pdf" | "spreadsheet"
    text: string
    url?: string
  }

  /** POST /api/chat/upload  → { name, text, type, size, url? } */
  router.add("POST", "/api/chat/upload", async (req) => {
    if (!authChat(req)) return apiErr("Unauthorized", 401)
    try {
      const form = await req.formData()
      const entry = form.get("file")
      if (!entry || typeof entry === "string") return apiErr("file is required as multipart/form-data")
      const file = entry as File
      const name = file.name || "upload"
      const ext = name.slice(name.lastIndexOf(".")).toLowerCase()
      const buf = await file.bytes()

      if (!ALLOWED_EXTS.has(ext) && ext.includes(".")) {
        return apiErr(`Unsupported file type "${ext}". Allowed: text, markdown, code, PDF, images, CSV, spreadsheets.`)
      }

      const maxSize = ext === ".pdf" ? 10_000_000 : ext === ".xlsx" || ext === ".xls" ? 5_000_000 : 200_000
      if (buf.length > maxSize) {
        return apiErr(`File too large (max ${(maxSize / (1024 * 1024)).toFixed(1)} MB)`)
      }

      const result: UploadResult = { name, size: buf.length, type: "text", text: "" }

      // ── Images ────────────────────────────────────────────────────────────
      if (IMAGE_EXTS.has(ext)) {
        const id = `${randomUUID().slice(0, 12)}${ext}`
        const savePath = joinPath(UPLOADS_DIR, id)
        await writeBinary(savePath, buf)
        result.type = "image"
        result.url = `/uploads/${id}`
        result.text = `[Attached Image: ${name}](${result.url})`
        return json(result)
      }

      // ── PDF ───────────────────────────────────────────────────────────────
      if (ext === ".pdf") {
        try {
          const { PDFParse } = await import("pdf-parse")
          const parser = new PDFParse(buf) as unknown as { getText: () => Promise<{ text: string }> }
          const pdfResult = await parser.getText()
          const pdfText = (pdfResult?.text ?? "").trim()
          if (!pdfText) return apiErr("PDF appears to have no extractable text")
          if (pdfText.length > 100_000) return apiErr("PDF text too long (max 100K characters)")
          result.type = "pdf"
          result.text = pdfText
          return json(result)
        } catch (e) {
          logger.error({ error: e, name }, "PDF parse failed")
          return apiErr("Could not parse PDF. The file may be scanned/encrypted.")
        }
      }

      // ── Spreadsheets (XLSX/XLS) ───────────────────────────────────────────
      if (ext === ".xlsx" || ext === ".xls") {
        try {
          const XLSX = await import("xlsx")
          const wb = XLSX.read(buf, { type: "buffer" })
          const lines: string[] = []
          for (const sheetName of wb.SheetNames) {
            const sheet = wb.Sheets[sheetName]
            const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
            if (csv.trim()) {
              lines.push(`--- ${sheetName} ---`, csv)
            }
          }
          const text = lines.join("\n").trim()
          if (!text) return apiErr("Spreadsheet appears to be empty")
          if (text.length > 100_000) return apiErr("Spreadsheet text too long (max 100K characters)")
          result.type = "spreadsheet"
          result.text = text
          return json(result)
        } catch (e) {
          logger.error({ error: e, name }, "Spreadsheet parse failed")
          return apiErr("Could not parse spreadsheet.")
        }
      }

      // ── CSV / TSV (also handled by spreadsheet block for .xlsx, but CSV goes here) ──
      if (ext === ".csv" || ext === ".tsv") {
        const text = new TextDecoder("utf-8", { fatal: false }).decode(buf).trim()
        if (!text) return apiErr("File appears to be empty")
        if (text.length > 100_000) return apiErr("File too long (max 100K characters)")
        result.type = "spreadsheet"
        result.text = text
        return json(result)
      }

      // ── Plain text ────────────────────────────────────────────────────────
      if (isLikelyBinary(buf) && ext !== ".pdf") {
        return apiErr("File appears to be binary. Only text-based files are supported.")
      }
      const text = new TextDecoder("utf-8", { fatal: false }).decode(buf).trim()
      if (!text) return apiErr("File appears to be empty")
      if (text.length > 100_000) return apiErr("File too long (max 100K characters)")
      result.text = text
      return json(result)
    } catch (e) {
      logger.error({ e }, "api POST /chat/upload error")
      return apiErr("Upload error", 500)
    }
  })

  /** GET /api/chat/history  → { messages: [{role,text}] } */
  router.add("GET", "/api/chat/history", async (req) => {
    if (!authChat(req)) return apiErr("Unauthorized", 401)
    try {
      const raw = await memory.readAll()
      const messages = raw
        .split("\n")
        .filter(l => l.startsWith("- "))
        .map(l => ({ role: "memory" as const, text: l.slice(2).trim() }))
      return json({ messages })
    } catch (e) {
      logger.error({ e }, "api /chat/history error")
      return apiErr("Internal error", 500)
    }
  })

  // ── memory ────────────────────────────────────────────────────────────────

  /** GET /api/memory  → { content, entries } */
  router.add("GET", "/api/memory", async (req) => {
    if (!authAdmin(req)) return apiErr("Unauthorized", 401)
    try {
      const content = await memory.readAll()
      const entries = content
        .split("\n")
        .filter(l => l.startsWith("- "))
        .map(l => l.slice(2).trim())
      return json({ content, entries })
    } catch (e) {
      logger.error({ e }, "api GET /memory error")
      return apiErr("Internal error", 500)
    }
  })

  /** POST /api/memory  body: { note, source? }  → { ok: true } */
  router.add("POST", "/api/memory", async (req) => {
    if (!authAdmin(req)) return apiErr("Unauthorized", 401)
    let body: { note?: string; source?: string }
    try { body = await req.json() } catch { return apiErr("Invalid JSON") }
    if (!body.note?.trim()) return apiErr("note is required")
    try {
      await memory.append(body.note.trim(), body.source ?? "web:admin")
      return json({ ok: true })
    } catch (e) {
      logger.error({ e }, "api POST /memory error")
      return apiErr("Internal error", 500)
    }
  })

  // ── admin ─────────────────────────────────────────────────────────────────

  /** GET /api/admin/status  → { status, uptime, pid, … } */
  router.add("GET", "/api/admin/status", async (req) => {
    if (!authAdmin(req)) return apiErr("Unauthorized", 401)
    return json({
      status: "ok",
      uptime: process.uptime(),
      pid: process.pid,
      version: "0.1.0",
      channels: ["api", "telegram", "whatsapp"],
      ts: new Date().toISOString(),
    })
  })

  /** GET /api/admin/config  → { config } — channel env vars for UI */
  router.add("GET", "/api/admin/config", async () => {
    try {
      const env = await readEnv()
      return json({
        config: {
          ENABLE_API: env.ENABLE_API ?? "true",
          API_PORT: env.API_PORT ?? "3100",
          API_HOSTNAME: env.API_HOSTNAME ?? "0.0.0.0",
          API_ADMIN_KEY: env.API_ADMIN_KEY ?? "",
          API_CHAT_KEY: env.API_CHAT_KEY ?? "",
          API_ENABLE_AUTH: env.API_ENABLE_AUTH ?? "true",
          API_CORS_ORIGIN: env.API_CORS_ORIGIN ?? "*",
          ENABLE_TELEGRAM: env.ENABLE_TELEGRAM ?? "true",
          TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN ?? "",
          ENABLE_WHATSAPP: env.ENABLE_WHATSAPP ?? "false",
          ENABLE_OPENCODE: env.ENABLE_OPENCODE ?? "true",
          LOG_LEVEL: env.LOG_LEVEL ?? "info",
          WHITELIST_PAIR_TOKEN: env.WHITELIST_PAIR_TOKEN ?? "",
          HEARTBEAT_INTERVAL_MINUTES: env.HEARTBEAT_INTERVAL_MINUTES ?? "30",
        },
      })
    } catch (e) {
      logger.error({ e }, "api GET /admin/config error")
      return apiErr("Internal error", 500)
    }
  })

  /** POST /api/admin/config  body: { updates: { KEY: value } }  → { config } */
  router.add("POST", "/api/admin/config", async (req) => {
    if (!authAdmin(req)) return apiErr("Unauthorized", 401)
    let body: { updates?: Record<string, string> }
    try { body = await req.json() } catch { return apiErr("Invalid JSON") }
    if (!body.updates || typeof body.updates !== "object") return apiErr("updates object required")
    try {
      const env = await writeEnv(body.updates)
      return json({ config: env })
    } catch (e) {
      logger.error({ e }, "api POST /admin/config error")
      return apiErr("Internal error", 500)
    }
  })

  /** POST /api/whitelist  body: { channel, userID }  → { created } */
  router.add("POST", "/api/whitelist", async (req) => {
    if (!authAdmin(req)) return apiErr("Unauthorized", 401)
    let body: { channel?: string; userID?: string }
    try { body = await req.json() } catch { return apiErr("Invalid JSON") }
    if (!body.channel || !body.userID) return apiErr("channel and userID required")
    if (body.channel !== "telegram" && body.channel !== "whatsapp")
      return apiErr("channel must be 'telegram' or 'whatsapp'")
    try {
      const created = await whitelist.add(body.channel, body.userID)
      return json({ created })
    } catch (e) {
      logger.error({ e }, "api POST /whitelist error")
      return apiErr("Internal error", 500)
    }
  })

  /** GET /api/whitelist  → { telegram: string[], whatsapp: string[] } */
  router.add("GET", "/api/whitelist", async () => {
    try {
      const raw = await readJson<{ telegram: string[]; whatsapp: string[] }>(whitelist.file())
      return json(raw)
    } catch (e) {
      logger.error({ e }, "api GET /whitelist error")
      return apiErr("Internal error", 500)
    }
  })

  /** GET /api/heartbeat/status  → { file, taskCount, empty } */
  router.add("GET", "/api/heartbeat/status", async (req) => {
    if (!authAdmin(req)) return apiErr("Unauthorized", 401)
    try {
      return json(await assistant.heartbeatTaskStatus())
    } catch (e) {
      logger.error({ e }, "api GET /heartbeat/status error")
      return apiErr("Internal error", 500)
    }
  })

  /** POST /api/heartbeat/run  → { result } */
  router.add("POST", "/api/heartbeat/run", async (req) => {
    if (!authAdmin(req)) return apiErr("Unauthorized", 401)
    try {
      const result = await assistant.runHeartbeatTasks()
      return json({ result })
    } catch (e) {
      logger.error({ e }, "api POST /heartbeat/run error")
      return apiErr("Internal error", 500)
    }
  })

  // ── projects ────────────────────────────────────────────────────────────

  /** GET /api/projects  → { projects, active } */
  router.add("GET", "/api/projects", async () => {
    return json({ projects: assistant.listProjects(), active: assistant.activeProject() })
  })

  /** POST /api/projects/set  body: { name }  → { result } */
  router.add("POST", "/api/projects/set", async (req) => {
    if (!authAdmin(req)) return apiErr("Unauthorized", 401)
    let body: { name?: string }
    try { body = await req.json() } catch { return apiErr("Invalid JSON") }
    if (!body.name?.trim()) return apiErr("name is required")
    try {
      const result = await assistant.setActiveProject(body.name.trim())
      return json({ result })
    } catch (e) {
      return apiErr((e as Error).message)
    }
  })

  /** POST /api/projects/add  body: { name, path }  → { result } */
  router.add("POST", "/api/projects/add", async (req) => {
    if (!authAdmin(req)) return apiErr("Unauthorized", 401)
    let body: { name?: string; path?: string }
    try { body = await req.json() } catch { return apiErr("Invalid JSON") }
    if (!body.name?.trim() || !body.path?.trim()) return apiErr("name and path are required")
    try {
      const result = await assistant.addProject(body.name.trim(), body.path.trim())
      return json({ result })
    } catch (e) {
      return apiErr((e as Error).message)
    }
  })

  /** POST /api/projects/remove  body: { name }  → { result } */
  router.add("POST", "/api/projects/remove", async (req) => {
    if (!authAdmin(req)) return apiErr("Unauthorized", 401)
    let body: { name?: string }
    try { body = await req.json() } catch { return apiErr("Invalid JSON") }
    if (!body.name?.trim()) return apiErr("name is required")
    try {
      const result = await assistant.removeProject(body.name.trim())
      return json({ result })
    } catch (e) {
      return apiErr((e as Error).message)
    }
  })

  // ── sessions (frontend multi-session support) ─────────────────────────

  /** GET /api/sessions  → { sessions: [{ frontendId, opencodeId, messageCount, createdAt }] } */
  router.add("GET", "/api/sessions", async () => {
    try {
      return json({ sessions: assistant.listFrontendSessions() })
    } catch (e) {
      logger.error({ e }, "api GET /sessions error")
      return apiErr("Internal error", 500)
    }
  })

  /** DELETE /api/sessions/:id  → { removed: boolean } */
  router.add("DELETE", "/api/sessions/:id", async (req, params) => {
    if (!authAdmin(req)) return apiErr("Unauthorized", 401)
    try {
      const removed = await assistant.deleteFrontendSession(params.id)
      return json({ removed })
    } catch (e) {
      logger.error({ e, id: params.id }, "api DELETE /sessions/:id error")
      return apiErr("Internal error", 500)
    }
  })

  // ── Bun HTTP server ───────────────────────────────────────────────────────

  Bun.serve({
    hostname,
    port,
    idleTimeout: 120,
    async fetch(req: Request) {
      const { pathname } = new URL(req.url)

      if (req.method === "OPTIONS")
        return new Response(null, { status: 204, headers: cors })

      // API routes
      if (pathname.startsWith("/api/")) {
        const match = router.match(req.method, pathname)
        if (!match) return addCors(apiErr("Not found", 404), cors)
        const res = await match.handler(req, match.params)
        return addCors(res, cors)
      }

      // Uploaded files (images, etc.)
      if (pathname.startsWith("/uploads/")) {
        const filePath = joinPath(UPLOADS_DIR, pathname.slice(9))
        const file = Bun.file(filePath)
        if (await file.exists()) return new Response(file)
        return addCors(apiErr("Not found", 404), cors)
      }

      // Static frontend (built React app)
      const distRoot = `${import.meta.dir}/../../frontend/dist`
      const filePath = pathname === "/" ? `${distRoot}/index.html` : `${distRoot}${pathname}`
      const file     = Bun.file(filePath)
      if (await file.exists()) return new Response(file)

      // SPA fallback
      const index = Bun.file(`${distRoot}/index.html`)
      if (await index.exists())
        return new Response(index, { headers: { "Content-Type": "text/html" } })

      return new Response("RadClaw — frontend not built. Run: cd frontend && npm run build", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      })
    },
    error(e: unknown) {
      logger.error({ e }, "api server unhandled error")
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    },
  })

  logger.info({ hostname, port }, "api adapter started")
  await new Promise<void>(() => {}) // keep alive
}
