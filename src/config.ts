import { readText } from "./utils/fs"
import { joinPath, resolvePath } from "./utils/path"

export type AppConfig = {
  radclawHome: string
  appName: string
  logLevel: string
  heartbeatIntervalMinutes: number
  heartbeatFile: string
  enableTelegram: boolean
  telegramToken?: string
  enableWhatsApp: boolean
  whatsAppAuthDir: string
  workspaceDir: string
  memoryFile: string
  opencodeModel?: string
  opencodeServerUrl?: string
  opencodeHostname: string
  opencodePort: number
  whitelistFile: string
  whitelistPairToken?: string
  projectsFile: string
  sessionsFile: string
  lastChannelFile: string
  outboxDir: string
  uploadsDir: string
  // ── API channel ──────────────────────────
  enableApi: boolean
  apiHostname: string
  apiPort: number
  apiAdminKey?: string
  apiChatKey?: string
  apiEnableAuth: boolean
  apiCorsOrigin: string
}

function envBool(value: string | undefined, fallback = false): boolean {
  if (!value) return fallback
  const v = value.trim().toLowerCase()
  return v === "1" || v === "true" || v === "yes" || v === "on"
}

function envInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : fallback
}

async function resolveOpencodeModel(explicitModel: string | undefined): Promise<string> {
  if (explicitModel && explicitModel.trim().length > 0) return explicitModel.trim()

  const home = Bun.env.HOME ?? ""
  const stateHome = Bun.env.XDG_STATE_HOME ?? joinPath(home, ".local", "state")
  const modelFile = joinPath(stateHome, "opencode", "model.json")

  try {
    const raw = await readText(modelFile)
    const parsed = JSON.parse(raw) as {
      recent?: Array<{ providerID?: string; modelID?: string }>
    }
    const first = parsed.recent?.[0]
    if (first?.providerID && first?.modelID) {
      return `${first.providerID}/${first.modelID}`
    }
  } catch {
    // Fall through to explicit error below.
  }

  throw new Error(
    `Missing OPENCODE_MODEL and no recent model found in ${modelFile}. Set OPENCODE_MODEL or pick a model in OpenCode first.`,
  )
}

export async function loadConfig(): Promise<AppConfig> {
  const home = Bun.env.RADCLAW_HOME || joinPath(Bun.env.HOME || "/root", ".radclaw")

  return {
    radclawHome: home,
    appName: Bun.env.APP_NAME ?? "rad",
    logLevel: Bun.env.LOG_LEVEL ?? "info",
    heartbeatIntervalMinutes: envInt(Bun.env.HEARTBEAT_INTERVAL_MINUTES, 30),
    heartbeatFile: resolvePath(home, Bun.env.HEARTBEAT_FILE ?? "workspace/HEARTBEAT.md"),
    enableTelegram: envBool(Bun.env.ENABLE_TELEGRAM, true),
    telegramToken: Bun.env.TELEGRAM_BOT_TOKEN,
    enableWhatsApp: envBool(Bun.env.ENABLE_WHATSAPP, false),
    whatsAppAuthDir: resolvePath(home, Bun.env.WHATSAPP_AUTH_DIR ?? "whatsapp-auth"),
    workspaceDir: resolvePath(home, "workspace"),
    memoryFile: resolvePath(home, "workspace", "MEMORY.md"),
    opencodeModel: await resolveOpencodeModel(Bun.env.OPENCODE_MODEL),
    opencodeServerUrl: Bun.env.OPENCODE_SERVER_URL,
    opencodeHostname: Bun.env.OPENCODE_HOSTNAME ?? "127.0.0.1",
    opencodePort: envInt(Bun.env.OPENCODE_PORT, 4096),
    whitelistFile: resolvePath(home, Bun.env.WHITELIST_FILE ?? "whitelist.json"),
    whitelistPairToken: Bun.env.WHITELIST_PAIR_TOKEN,
    projectsFile: resolvePath(home, Bun.env.PROJECTS_FILE ?? "projects.json"),
    sessionsFile: resolvePath(home, "sessions.json"),
    lastChannelFile: resolvePath(home, "last-channel.json"),
    outboxDir: resolvePath(home, "outbox"),
    uploadsDir: resolvePath(home, "uploads"),
    // ── API channel ──────────────────────────
    enableApi: envBool(Bun.env.ENABLE_API, true),
    apiHostname: Bun.env.API_HOSTNAME ?? "0.0.0.0",
    apiPort: envInt(Bun.env.API_PORT, 3100),
    apiAdminKey: Bun.env.API_ADMIN_KEY,
    apiChatKey: Bun.env.API_CHAT_KEY,
    apiEnableAuth: envBool(Bun.env.API_ENABLE_AUTH, true),
    apiCorsOrigin: Bun.env.API_CORS_ORIGIN ?? "*",
  }
}
