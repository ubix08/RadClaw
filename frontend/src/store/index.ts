import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ChatSession, Message, Settings, View } from "../types"
import { ApiClient } from "../lib/api"

const DEFAULT_SETTINGS: Settings = {
  apiBase:      "",
  apiChatKey:   "",
  apiAdminKey:  "",
  streamMode:   true,
  userID:       "web:user",
}

interface AppState {
  view: View
  sidebarOpen: boolean

  messages: Message[]
  isLoading: boolean
  abortCtrl: AbortController | null
  error: string | null

  sessions: ChatSession[]
  activeSessionId: string | null

  settings: Settings

  setView: (v: View) => void
  setSidebar: (open: boolean) => void
  setSettings: (s: Partial<Settings>) => void
  setError: (msg: string | null) => void

  sendMessage: (text: string) => Promise<void>
  clearChat: () => void
  newSession: () => Promise<void>
  switchSession: (id: string) => void
  deleteSession: (id: string) => void
  renameSession: (id: string, title: string) => void

  getClient: () => ApiClient
}

let _clientCache: ApiClient | null = null
let _clientKey = ""

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function sessionTitle(messages: Message[]): string {
  const first = messages.find((m) => m.role === "user")
  if (!first) return "New chat"
  const text = first.content.slice(0, 60)
  return text.length < first.content.length ? text + "…" : text
}

function saveCurrentAsSession(get: () => AppState, set: (partial: Partial<AppState>) => void) {
  const { messages, sessions } = get()
  if (messages.length === 0) return
  const id = genId()
  const now = Date.now()
  const s: ChatSession = {
    id,
    title: sessionTitle(messages),
    messages: [...messages],
    createdAt: now,
    updatedAt: now,
  }
  set({ sessions: [s, ...sessions].slice(0, 50) })
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      view:           "chat",
      sidebarOpen:    false,
      messages:       [],
      isLoading:      false,
      abortCtrl:      null,
      error:          null,
      sessions:       [],
      activeSessionId: null,
      settings:       DEFAULT_SETTINGS,

      setView: (view) => set({ view, sidebarOpen: false }),
      setSidebar: (sidebarOpen) => set({ sidebarOpen }),
      setError: (error) => set({ error }),
      setSettings: (s) => {
        _clientCache = null
        set((st) => ({ settings: { ...st.settings, ...s } }))
      },

      getClient() {
        const { settings } = get()
        const key = `${settings.apiBase}|${settings.apiChatKey}|${settings.apiAdminKey}`
        if (!_clientCache || _clientKey !== key) {
          _clientCache = new ApiClient(
            settings.apiBase || window.location.origin,
            settings.apiChatKey,
            settings.apiAdminKey,
          )
          _clientKey = key
        }
        return _clientCache
      },

      async sendMessage(text: string) {
        const { settings, isLoading, abortCtrl, getClient } = get()
        if (isLoading) {
          abortCtrl?.abort()
          set({ isLoading: false, abortCtrl: null })
          if (!text.trim()) return // stop-only, no new message
          // fall through to send new message
        }

        const userMsg: Message = { id: genId(), role: "user", content: text, ts: Date.now() }
        const asstId = genId()
        const asstMsg: Message = { id: asstId, role: "assistant", content: "", ts: Date.now(), streaming: true }

        set((st) => ({ messages: [...st.messages, userMsg, asstMsg], isLoading: true }))

        const client = getClient()

        const patchLast = (patch: Partial<Message>) =>
          set((st) => ({
            messages: st.messages.map((m) => (m.id === asstId ? { ...m, ...patch } : m)),
          }))

        if (settings.streamMode) {
          const ctrl = client.streamChat(
            text,
            settings.userID,
            (_chunk, accumulated) => patchLast({ content: accumulated }),
            (reply) => {
              patchLast({ content: reply, streaming: false })
              set({ isLoading: false, abortCtrl: null })
            },
            (msg, _accumulated) => {
              patchLast({ content: _accumulated || msg, streaming: false, error: true })
              set({ isLoading: false, abortCtrl: null })
            },
          )
          set({ abortCtrl: ctrl })
        } else {
          try {
            const { reply } = await client.chat(text, settings.userID)
            patchLast({ content: reply, streaming: false })
          } catch (e) {
            patchLast({ content: (e as Error).message, streaming: false, error: true })
          } finally {
            set({ isLoading: false, abortCtrl: null })
          }
        }
      },

      clearChat() {
        get().abortCtrl?.abort()
        set({ messages: [], isLoading: false, abortCtrl: null })
      },

      async newSession() {
        saveCurrentAsSession(get, set)
        try {
          await get().getClient().newSession()
          get().clearChat()
          set({ activeSessionId: null, error: null })
        } catch (e) {
          set({ error: `Failed to start new session: ${(e as Error).message}` })
        }
      },

      async switchSession(id: string) {
        const { sessions, abortCtrl } = get()
        abortCtrl?.abort()
        const session = sessions.find((s) => s.id === id)
        if (!session) return
        set({
          messages: session.messages,
          activeSessionId: id,
          isLoading: false,
          abortCtrl: null,
        })
        // Reset backend session context so new messages start fresh
        try {
          await get().getClient().newSession()
        } catch {
          // Silently ignore — backend session will be created on next ask
        }
      },

      deleteSession(id: string) {
        const { sessions, activeSessionId } = get()
        set({
          sessions: sessions.filter((s) => s.id !== id),
          activeSessionId: activeSessionId === id ? null : activeSessionId,
          messages: activeSessionId === id ? [] : get().messages,
        })
      },

      renameSession(id: string, title: string) {
        set((st) => ({
          sessions: st.sessions.map((s) => (s.id === id ? { ...s, title } : s)),
        }))
      },
    }),

    {
      name: "radclaw-store",
      partialize: (s) => ({
        settings: s.settings,
        sessions: s.sessions,
        activeSessionId: s.activeSessionId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        // Restore messages from active session on refresh
        if (state.activeSessionId && state.messages.length === 0) {
          const session = state.sessions.find((s) => s.id === state.activeSessionId)
          if (session) {
            state.messages = session.messages
          }
        }
      },
    },
  ),
)
