import { useEffect, useRef } from "react"
import { Plus, Trash2, Menu, Clock } from "lucide-react"
import { useStore } from "../store"
import { MessageBubble } from "../components/MessageBubble"
import { ChatInput } from "../components/ChatInput"

const WELCOME_PROMPTS = [
  "What can you help me with?",
  "Summarize recent heartbeat tasks",
  "Show me what's in my memory",
  "Start a new coding session",
]

export function ChatPage() {
  const { messages, isLoading, error, clearChat, newSession, setSidebar, setError, setView } = useStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const { sendMessage } = useStore()

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => setSidebar(true)} className="lg:hidden p-2 rounded-lg text-text-2 hover:text-text hover:bg-bg-3 transition-colors">
            <Menu size={18} />
          </button>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-text">Chat</span>
            {isLoading && (
              <span className="flex items-center gap-1.5 text-xs text-accent">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                thinking…
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setView("sessions")}
            className="p-2 rounded-lg text-text-2 hover:text-text hover:bg-bg-3 transition-colors"
            title="Sessions"
          >
            <Clock size={16} />
          </button>
          <button
            onClick={clearChat}
            disabled={messages.length === 0}
            className="p-2 rounded-lg text-text-2 hover:text-text hover:bg-bg-3 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Clear chat"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={() => void newSession()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-text-2 hover:text-text hover:bg-bg-3 transition-colors border border-border"
            title="New session"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">New session</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-6">
        {error && (
          <div className="px-4 py-2 mx-4 mb-2 bg-red-900/20 border border-red-800/40 rounded-xl text-red-400 text-xs flex items-center gap-2 max-w-4xl lg:mx-auto">
            <span className="shrink-0">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto shrink-0 hover:text-red-300">&times;</button>
          </div>
        )}
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 gap-8">
            <div className="text-center space-y-3">
              <div className="text-5xl">🐾</div>
              <h2 className="text-2xl font-semibold text-text">RadClaw</h2>
              <p className="text-text-2 text-sm max-w-xs">
                Autonomous agent powered by OpenCode. Ask anything — code, research, tasks.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {WELCOME_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => void sendMessage(p)}
                  className="text-left px-4 py-3 rounded-xl bg-bg-3 border border-border hover:border-border-2 hover:bg-bg-4 text-sm text-text-2 hover:text-text transition-all"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-5 pb-2 px-4 lg:px-0">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <ChatInput />
    </div>
  )
}
