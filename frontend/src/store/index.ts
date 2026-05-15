import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ChatSession, Message, MessagePart, Settings, View } from "../types"
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
  deleteSession: (id: string) => Promise<void>
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

function textFromParts(parts: MessagePart[]): string {
  return parts
    .filter((p): p is MessagePart & { text: string } =>
      p.type === "text" || p.type === "tool_result"
    )
    .map((p) => p.text)
    .join("")
}

function saveCurrentAsSession(get: () => AppState, set: (partial: Partial<AppState>) => void, sessionId?: string) {
  const { messages, sessions } = get()
  if (messages.length === 0) return
  const now = Date.now()

  if (sessionId) {
    const idx = sessions.findIndex((s) => s.id === sessionId)
    if (idx !== -1) {
      const updated = [...sessions]
      updated[idx] = { ...updated[idx], messages: [...messages], updatedAt: now, title: sessionTitle(messages) }
      set({ sessions: updated })
      return
    }
  }

  const id = genId()
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
          set((st) => ({
            isLoading: false,
            abortCtrl: null,
            messages: st.messages.map((m) => m.streaming ? { ...m, streaming: false } : m),
          }))
          if (!text.trim()) return
        }

        let sid = get().activeSessionId
        if (!sid) {
          sid = genId()
          const now = Date.now()
          const s: ChatSession = {
            id: sid,
            title: "New chat",
            messages: [],
            createdAt: now,
            updatedAt: now,
          }
          set({ activeSessionId: sid, sessions: [s, ...get().sessions].slice(0, 50) })
        }

        const userMsg: Message = { id: genId(), role: "user", content: text, parts: [], ts: Date.now() }
        const asstId = genId()
        const asstMsg: Message = { id: asstId, role: "assistant", content: "", parts: [], ts: Date.now(), streaming: true }

        set((st) => ({ messages: [...st.messages, userMsg, asstMsg], isLoading: true }))

        const client = getClient()

        const patchParts = (part: MessagePart) =>
          set((st) => {
            const asst = st.messages.find((m) => m.id === asstId)
            if (!asst) return st
            const newParts = [...asst.parts, part]
            const newContent = textFromParts(newParts)
            return {
              messages: st.messages.map((m) =>
                m.id === asstId
                  ? { ...m, parts: newParts, content: newContent }
                  : m
              ),
            }
          })

        const finishMessage = () => {
          set((st) => ({
            isLoading: false,
            abortCtrl: null,
            messages: st.messages.map((m) =>
              m.id === asstId
                ? { ...m, streaming: false }
                : m
            ),
          }))
          saveCurrentAsSession(get, set, get().activeSessionId!)
        }

        if (settings.streamMode) {
          const ctrl = client.streamChat(
            text,
            settings.userID,
            sid,
            patchParts,
            () => finishMessage(),
            (msg) => {
              set((st) => ({
                isLoading: false,
                abortCtrl: null,
                messages: st.messages.map((m) =>
                  m.id === asstId
                    ? { ...m, streaming: false, error: true, content: msg }
                    : m
                ),
              }))
            },
          )
          set({ abortCtrl: ctrl })
        } else {
          try {
            const { reply } = await client.chat(text, settings.userID, sid)
            set((st) => ({
              messages: st.messages.map((m) =>
                m.id === asstId
                  ? { ...m, content: reply, parts: [{ type: "text", text: reply }], streaming: false }
                  : m
              ),
            }))
            finishMessage()
          } catch (e) {
            set((st) => ({
              isLoading: false,
              abortCtrl: null,
              messages: st.messages.map((m) =>
                m.id === asstId
                  ? { ...m, content: (e as Error).message, streaming: false, error: true }
                  : m
              ),
            }))
          }
        }
      },

      clearChat() {
        get().abortCtrl?.abort()
        set({ messages: [], isLoading: false, abortCtrl: null })
      },

      async newSession() {
        const { activeSessionId } = get()
        saveCurrentAsSession(get, set, activeSessionId ?? undefined)
        get().clearChat()
        set({ activeSessionId: null, error: null })
      },

      async switchSession(id: string) {
        const { sessions, abortCtrl, activeSessionId } = get()
        abortCtrl?.abort()
        const session = sessions.find((s) => s.id === id)
        if (!session) return
        if (activeSessionId) {
          saveCurrentAsSession(get, set, activeSessionId)
        }
        set({
          messages: session.messages,
          activeSessionId: id,
          isLoading: false,
          abortCtrl: null,
        })
      },

      async deleteSession(id: string) {
        const { sessions, activeSessionId } = get()
        set({
          sessions: sessions.filter((s) => s.id !== id),
          activeSessionId: activeSessionId === id ? null : activeSessionId,
          messages: activeSessionId === id ? [] : get().messages,
        })
        try {
          await get().getClient().deleteBackendSession(id)
        } catch {
          // Silently ignore
        }
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
        messages: s.messages,
      }),
    },
  ),
)
