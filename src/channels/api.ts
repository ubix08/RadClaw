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
import { readJson } from "../utils/fs"

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
    let body: { text?: string; userID?: string }
    try { body = await req.json() } catch { return apiErr("Invalid JSON") }
    if (!body.text?.trim()) return apiErr("text is required")
    const userID = (body.userID ?? "web:anonymous").trim()
    try {
      const reply = await assistant.ask({ channel: "system", userID, text: body.text.trim() })
      return json({ reply, userID })
    } catch (e) {
      logger.error({ e }, "api /chat error")
      return apiErr("Internal error", 500)
    }
  })

  /** POST /api/chat/stream  → SSE: token* → done | error */
  router.add("POST", "/api/chat/stream", async (req) => {
    if (!authChat(req)) return apiErr("Unauthorized", 401)
    let body: { text?: string; userID?: string }
    try { body = await req.json() } catch { return apiErr("Invalid JSON") }
    if (!body.text?.trim()) return apiErr("text is required")
    const userID = (body.userID ?? "web:anonymous").trim()
    const text   = body.text.trim()

    const stream = new ReadableStream({
      async start(ctrl) {
        const enc  = new TextEncoder()
        const emit = (evt: string, data: unknown) =>
          ctrl.enqueue(enc.encode(sseFrame(evt, data)))

        try {
          // AssistantCore is synchronous-reply — simulate streaming per word
          const reply = await assistant.ask({ channel: "system", userID, text })
          const words = reply.split(/(\s+)/)
          let buf = ""
          for (const w of words) {
            buf += w
            emit("token", { chunk: w, accumulated: buf })
            await new Promise(r => setTimeout(r, 8))
          }
          emit("done", { reply })
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

  /** POST /api/chat/upload  → { name, text } — upload text/binary file, get extracted text */
  router.add("POST", "/api/chat/upload", async (req) => {
    if (!authChat(req)) return apiErr("Unauthorized", 401)
    try {
      const form = await req.formData()
      const entry = form.get("file")
      if (!entry || typeof entry === "string") return apiErr("file is required as multipart/form-data")
      const file = entry as File
      const name = file.name || "upload"
      const buf = await file.bytes()
      const maxBytes = 500_000
      if (buf.length > maxBytes) return apiErr(`File too large (max ${maxBytes} bytes)`)
      const text = new TextDecoder("utf-8", { fatal: false }).decode(buf)
      return json({ name, text, size: buf.length })
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
