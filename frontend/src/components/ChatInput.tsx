import { useRef, useCallback, useEffect, useState } from "react"
import { ArrowUp, Square, Paperclip, FileText, X } from "lucide-react"
import { useStore } from "../store"

export function ChatInput() {
  const { sendMessage, isLoading, getClient } = useStore()
  const [text, setText] = useState("")
  const [uploading, setUploading] = useState(false)
  const [attachedFile, setAttachedFile] = useState<{ name: string; text: string } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [])

  useEffect(() => { resize() }, [text, resize])

  const submit = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed && !attachedFile) {
      if (isLoading) sendMessage("") // stop only
      return
    }
    const finalText = attachedFile
      ? `[File: ${attachedFile.name}]\n\`\`\`\n${attachedFile.text}\n\`\`\`\n\n${trimmed}`
      : trimmed
    setText("")
    setAttachedFile(null)
    void sendMessage(finalText)
  }, [text, isLoading, sendMessage, attachedFile])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const maxSize = 500_000
      if (file.size > maxSize) {
        alert(`File too large. Max ${maxSize / 1000} KB.`)
        return
      }
      const result = await getClient().uploadFile(file)
      setAttachedFile({ name: result.name, text: result.text })
    } catch (err) {
      alert(`Upload failed: ${(err as Error).message}`)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <div className="px-3 pb-3 pt-2 lg:px-6 lg:pb-5 lg:pt-3 shrink-0">
      <div className="relative max-w-3xl mx-auto">
        {/* Attached file badge */}
        {attachedFile && (
          <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-accent/10 border border-accent/20 rounded-lg text-xs text-text">
            <FileText size={14} className="text-accent shrink-0" />
            <span className="truncate flex-1">{attachedFile.name}</span>
            <button
              onClick={() => setAttachedFile(null)}
              className="p-0.5 rounded hover:bg-bg-3 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2 bg-bg-3 border border-border rounded-2xl px-3 py-2.5 focus-within:border-border-2 transition-colors shadow-lg">
          {/* Upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={[
              "shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all",
              uploading
                ? "bg-accent/20 text-accent animate-pulse"
                : "text-text-3 hover:text-text hover:bg-bg-4",
            ].join(" ")}
            title="Attach file"
          >
            <Paperclip size={15} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFilePick}
          />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={attachedFile ? "Add a message or press Enter to send…" : "Message RadClaw…"}
            rows={1}
            className={[
              "flex-1 resize-none bg-transparent outline-none text-text text-[0.9375rem]",
              "placeholder:text-text-3 leading-relaxed min-h-[26px] max-h-[200px]",
              "scrollbar-thin scrollbar-thumb-border",
            ].join(" ")}
            style={{ scrollbarWidth: "thin" }}
          />

          {/* Send / Stop button */}
          <button
            onClick={submit}
            disabled={!isLoading && !text.trim() && !attachedFile}
            className={[
              "shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all",
              isLoading
                ? "bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30"
                : text.trim() || attachedFile
                ? "bg-accent text-bg hover:bg-accent/90"
                : "bg-bg-4 text-text-3 cursor-not-allowed",
            ].join(" ")}
            title={isLoading ? "Stop" : "Send (Enter)"}
          >
            {isLoading ? <Square size={14} /> : <ArrowUp size={16} />}
          </button>
        </div>
      </div>

      <p className="text-center text-[11px] text-text-3 mt-2">
        RadClaw can make mistakes. Verify important info.
      </p>
    </div>
  )
}
