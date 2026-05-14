import { useState, useCallback } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Message } from "../types"
import { Copy, Check } from "lucide-react"

interface Props {
  message: Message
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 h-4">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-text-2 animate-pulse-dot"
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </span>
  )
}

function CodeBlock({ language, children }: { language?: string; children: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [children])

  return (
    <div className="group relative my-3 rounded-xl overflow-hidden border border-border bg-bg-4/60">
      <div className="flex items-center justify-between px-4 py-1.5 bg-bg-3 border-b border-border text-[11px] text-text-3">
        <span>{language || "code"}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-bg-4 transition-colors text-text-3 hover:text-text-2"
        >
          {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
        <code className="!bg-transparent !p-0 !text-text-2">{children}</code>
      </pre>
    </div>
  )
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[0.825rem] bg-bg-4 text-accent px-1.5 py-0.5 rounded-md border border-border/60">
      {children}
    </code>
  )
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === "user"
  const isStreaming = message.streaming

  return (
    <div
      className={[
        "group flex gap-3 animate-fade-up",
        isUser ? "flex-row-reverse" : "flex-row",
      ].join(" ")}
    >
      <div className="shrink-0 mt-1">
        {isUser ? (
          <div className="w-7 h-7 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-xs font-semibold text-accent">
            U
          </div>
        ) : (
          <div className="w-7 h-7 rounded-full bg-bg-3 border border-border flex items-center justify-center text-sm">
            🐾
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 min-w-0 flex-1 max-w-[90%] lg:max-w-[85%]">
        {isUser ? (
          <div className="px-4 py-2.5 rounded-2xl rounded-tr-sm bg-user-bg border border-user-border text-text text-[0.9375rem] leading-relaxed self-start">
            {message.content}
          </div>
        ) : (
          <div className={message.error ? "text-red-400" : "w-full"}>
            {isStreaming && !message.content ? (
              <div className="px-4 py-3 rounded-xl bg-bg-3 border border-border inline-block">
                <TypingDots />
              </div>
            ) : (
              <div className="prose-radclaw w-full">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || "")
                      const isInline = !match && !className
                      const text = String(children).replace(/\n$/, "")
                      if (isInline) return <InlineCode>{text}</InlineCode>
                      return <CodeBlock language={match?.[1]}>{text}</CodeBlock>
                    },
                    pre({ children }) {
                      return <>{children}</>
                    },
                  }}
                >
                  {message.content + (isStreaming ? "▋" : "")}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}

        <span className="text-[11px] text-text-3 opacity-0 group-hover:opacity-100 transition-opacity px-1">
          {new Date(message.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  )
}
