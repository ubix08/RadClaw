export type Role = "user" | "assistant" | "system"

export interface Message {
  id: string
  role: Role
  content: string
  ts: number
  streaming?: boolean
  error?: boolean
}

export interface ChatSession {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

export interface AdminStatus {
  status: string
  uptime: number
  pid: number
  version: string
  channels: string[]
  ts: string
}

export interface HeartbeatStatus {
  file: string
  taskCount: number
  empty: boolean
}

export interface MemoryEntry {
  content: string
  entries: string[]
}

export interface BackendSession {
  frontendId: string
  opencodeId: string
  messageCount: number
  createdAt: number
}

export type View = "chat" | "sessions" | "admin" | "memory" | "settings"

export interface ServerConfig {
  ENABLE_API: string
  API_PORT: string
  API_HOSTNAME: string
  API_ADMIN_KEY: string
  API_CHAT_KEY: string
  API_ENABLE_AUTH: string
  API_CORS_ORIGIN: string
  ENABLE_TELEGRAM: string
  TELEGRAM_BOT_TOKEN: string
  ENABLE_WHATSAPP: string
  ENABLE_OPENCODE: string
  LOG_LEVEL: string
  WHITELIST_PAIR_TOKEN: string
  HEARTBEAT_INTERVAL_MINUTES: string
}

export interface WhitelistData {
  telegram: string[]
  whatsapp: string[]
}

export interface Settings {
  apiBase: string
  apiChatKey: string
  apiAdminKey: string
  streamMode: boolean
  userID: string
}
