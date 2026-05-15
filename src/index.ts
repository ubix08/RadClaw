import { loadConfig } from "./config"
import { ensureScaffold, resolvePaths } from "./bootstrap"
import { startTelegramAdapter } from "./channels/telegram"
import { startWhatsAppAdapter } from "./channels/whatsapp"
import { startApiAdapter } from "./channels/api"
import { AssistantCore } from "./core/assistant"
import { SessionStore } from "./core/session-store"
import { WhitelistStore } from "./core/whitelist-store"
import { MemoryStore } from "./memory/store"
import { ProjectStore } from "./store/projects"
import { SourceStore } from "./store/sources"
import { startHeartbeat } from "./scheduler/heartbeat"
import { createLogger } from "./utils/logger"
import { readJson } from "./utils/fs"

import { defaultRadclawHome } from "./bootstrap"
process.env.OPENCODE_CONFIG_DIR ??= defaultRadclawHome()

async function detectFirstRun(home: string): Promise<boolean> {
  const paths = resolvePaths(home)
  try {
    const whitelist = await readJson<{ telegram: string[]; whatsapp: string[] }>(paths.whitelistFile)
    if (whitelist.telegram?.length > 0 || whitelist.whatsapp?.length > 0) return false
    const sessions = await readJson<Record<string, unknown>>(paths.sessionsFile)
    return Object.keys(sessions).length === 0
  } catch {
    return true
  }
}

async function main() {
  const cfg = await loadConfig()
  const logger = createLogger(cfg.logLevel)

  // Scaffold ~/.radclaw/ workspace on every start (no-op if already exists)
  const paths = await ensureScaffold(cfg.radclawHome)
  logger.info({ home: cfg.radclawHome }, "radclaw workspace ready")

  // Detect first run — no whitelist entries and no sessions → guide to setup
  const firstRun = await detectFirstRun(cfg.radclawHome)
  if (firstRun) {
    logger.info(
      "First run detected — run 'bun run setup' to configure Telegram/WhatsApp channels. "
      + "The API channel is enabled by default for the web frontend.",
    )
  }

  const memory    = new MemoryStore(cfg.workspaceDir)
  const sessions  = new SessionStore(cfg.sessionsFile)
  const whitelist = new WhitelistStore(cfg.whitelistFile)
  const projects  = new ProjectStore(cfg.projectsFile, cfg.radclawHome)
  const sources   = new SourceStore(cfg.sourcesFile)
  const assistant = new AssistantCore(logger, memory, sessions, projects, sources, {
    model: cfg.opencodeModel,
    serverUrl: cfg.opencodeServerUrl,
    hostname: cfg.opencodeHostname,
    port: cfg.opencodePort,
    heartbeatFile: cfg.heartbeatFile,
    heartbeatIntervalMinutes: cfg.heartbeatIntervalMinutes,
    projectsFile: cfg.projectsFile,
    workspaceDir: cfg.workspaceDir,
    agentsDir: cfg.agentsDir,
  })

  await assistant.init()
  await whitelist.init()
  await sources.init()

  const heartbeatStatus = await assistant.heartbeatTaskStatus()
  if (heartbeatStatus.empty) {
    logger.warn({ heartbeatFile: heartbeatStatus.file },
      "heartbeat.md is empty — heartbeat disabled until tasks are added")
  } else {
    startHeartbeat(cfg.heartbeatIntervalMinutes, assistant, logger)
  }

  let shuttingDown = false
  const shutdown = (code: number) => {
    if (shuttingDown) return
    shuttingDown = true
    void assistant.close().finally(() => process.exit(code))
  }

  process.on("SIGINT",  () => shutdown(0))
  process.on("SIGTERM", () => shutdown(0))
  process.on("SIGHUP",  () => shutdown(0))
  process.on("SIGQUIT", () => shutdown(0))
  process.on("exit",    () => { void assistant.close() })
  process.on("uncaughtException",  (e) => { logger.error({ e }, "uncaught exception");  shutdown(1) })
  process.on("unhandledRejection", (r) => { logger.error({ r }, "unhandled rejection"); shutdown(1) })

  const starters: Array<Promise<void>> = []

  if (cfg.enableApi) {
    starters.push(startApiAdapter({
      logger,
      assistant,
      whitelist,
      memory,
      sources,
      hostname:   cfg.apiHostname,
      port:       cfg.apiPort,
      adminKey:   cfg.apiAdminKey,
      chatKey:    cfg.apiChatKey,
      enableAuth: cfg.apiEnableAuth,
      corsOrigin: cfg.apiCorsOrigin,
      uploadsDir: cfg.uploadsDir,
      sourcesFile: cfg.sourcesFile,
    }))
    logger.info({ port: cfg.apiPort }, "api channel enabled")
  }

  if (cfg.enableTelegram) {
    if (!cfg.telegramToken) {
      logger.warn("ENABLE_TELEGRAM=true but TELEGRAM_BOT_TOKEN missing")
    } else {
      starters.push(startTelegramAdapter({
        token: cfg.telegramToken,
        logger,
        assistant,
        whitelist,
        pairToken: cfg.whitelistPairToken,
      }))
    }
  }

  if (cfg.enableWhatsApp) {
    starters.push(startWhatsAppAdapter({
      authDir: cfg.whatsAppAuthDir,
      logger,
      assistant,
      whitelist,
      pairToken: cfg.whitelistPairToken,
    }))
  }

  if (starters.length === 0) {
    logger.warn("No channel enabled. Set ENABLE_API, ENABLE_TELEGRAM, or ENABLE_WHATSAPP.")
  }

  await Promise.all(starters)
}

void main().catch(e => { console.error(e); process.exit(1) })
