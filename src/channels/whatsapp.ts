import {
  DisconnectReason,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys"
import makeWASocket from "@whiskeysockets/baileys"
import type { Logger } from "pino"
// @ts-ignore qrcode-terminal ships without bundled types in some installs.
import qrcode from "qrcode-terminal"
import { AssistantCore } from "../core/assistant"
import { WhitelistStore } from "../core/whitelist-store"
import { splitTextChunks } from "../utils/format-message"
import { ackOutbox, listOutbox } from "../utils/outbox"

type WhatsAppAdapterOptions = {
  authDir: string
  logger: Logger
  assistant: AssistantCore
  whitelist: WhitelistStore
  pairToken?: string
}

function extractText(message: any): string {
  return (
    message?.conversation ??
    message?.extendedTextMessage?.text ??
    message?.imageMessage?.caption ??
    ""
  )
}

export async function startWhatsAppAdapter(opts: WhatsAppAdapterOptions): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(opts.authDir)

  const sock = makeWASocket({
    auth: state,
  })
  let flushingOutbox = false
  let connected = false
  let connectTimeout: ReturnType<typeof setTimeout> | undefined

  const normalizeJid = (jid: string) => (jid.includes("@") ? jid : `${jid}@s.whatsapp.net`)

  const flushOutbox = async () => {
    if (flushingOutbox) return
    flushingOutbox = true
    try {
      const pending = await listOutbox("whatsapp")
      if (!connected) {
        if (pending.length > 0) {
          opts.logger.warn({ pending: pending.length }, "whatsapp outbox pending but not connected")
        }
        return
      }
      for (const item of pending) {
        try {
          const target = normalizeJid(item.message.userID)
          const chunks = splitTextChunks(item.message.text, 3500)
          for (const chunk of chunks) {
            await sock.sendMessage(target, { text: chunk })
          }
          await ackOutbox(item.filePath)
          opts.logger.info({ jid: target, chunkCount: chunks.length }, "whatsapp proactive message sent")
        } catch (error) {
          opts.logger.warn({ error, jid: item.message.userID }, "whatsapp outbox send failed")
        }
      }
    } catch (error) {
      opts.logger.warn({ error }, "whatsapp outbox flush failed")
    } finally {
      flushingOutbox = false
    }
  }

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update
    if (qr) {
      qrcode.generate(qr, { small: true })
      opts.logger.info("whatsapp qr generated")
    }

    if (connection === "connecting" && !connectTimeout) {
      connectTimeout = setTimeout(() => {
        opts.logger.warn("whatsapp connection stuck; restarting socket")
        connectTimeout = undefined
        void startWhatsAppAdapter(opts)
        sock.end?.(new Error("restart"))
      }, 20_000)
    }

    if (connection === "open") {
      connected = true
      if (connectTimeout) {
        clearTimeout(connectTimeout)
        connectTimeout = undefined
      }
      opts.logger.info("whatsapp adapter connected")
      void flushOutbox()
      return
    }

    if (connection === "close") {
      connected = false
      if (connectTimeout) {
        clearTimeout(connectTimeout)
        connectTimeout = undefined
      }
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode
      const message = (lastDisconnect?.error as any)?.message
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut
      opts.logger.warn({ statusCode, shouldReconnect, errorMessage: message }, "whatsapp connection closed")
      if (shouldReconnect) {
        setTimeout(() => {
          void startWhatsAppAdapter(opts)
        }, 3000)
      }
    }
  })

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue
      const jid = msg.key.remoteJid
      if (!jid) continue

      const text = extractText(msg.message).trim()
      if (!text) continue
      opts.logger.info({ jid, textLength: text.length }, "whatsapp message received")

      if (text.startsWith("/pair")) {
        const token = text.slice("/pair".length).trim()
        if (!opts.pairToken) {
          await sock.sendMessage(jid, { text: "Pairing is disabled by admin. Ask admin to whitelist your account." })
          continue
        }
        if (!token) {
          await sock.sendMessage(jid, { text: "Usage: /pair <token>" })
          continue
        }
        if (token !== opts.pairToken) {
          await sock.sendMessage(jid, { text: "Invalid pairing token." })
          continue
        }
        const created = await opts.whitelist.add("whatsapp", jid)
        opts.logger.info({ jid, created }, "whatsapp pairing")
        await sock.sendMessage(jid, { text: created ? "Pairing successful. You are now whitelisted." : "You are already whitelisted." })
        continue
      }

      const allowed = opts.whitelist.isWhitelisted("whatsapp", jid)
      if (!allowed) {
        await sock.sendMessage(jid, {
          text: [
            "Access restricted.",
            `Your WhatsApp ID: ${jid}`,
            "Send /pair <token> to whitelist yourself.",
            `If you don't have a token, ask admin to add you under 'whatsapp' in ${opts.whitelist.displayFile()}.`,
          ].join("\n"),
        })
        continue
      }

      if (text === "/new") {
        const sessionID = await opts.assistant.startNewMainSession(`whatsapp:${jid}`)
        await sock.sendMessage(jid, { text: `Started new shared session: ${sessionID}` })
        continue
      }

      if (text.startsWith("/project")) {
        const args = text.slice("/project".length).trim().split(/\s+/)
        const subcommand = args[0]
        const asst = opts.assistant

        if (!subcommand) {
          const lines = [asst.projectListText()]
          const active = asst.activeProject()
          if (active) lines.unshift(`Active project: ${active.name} (${active.path})`)
          await sock.sendMessage(jid, { text: lines.join("\n") })
          continue
        }

        if (subcommand === "add" && args[1] && args[2]) {
          try {
            const msg = await asst.addProject(args[1], args[2])
            await sock.sendMessage(jid, { text: msg })
          } catch (e) {
            await sock.sendMessage(jid, { text: `Error: ${(e as Error).message}` })
          }
          continue
        }

        if (subcommand === "remove" && args[1]) {
          try {
            const msg = await asst.removeProject(args[1])
            await sock.sendMessage(jid, { text: msg })
          } catch (e) {
            await sock.sendMessage(jid, { text: `Error: ${(e as Error).message}` })
          }
          continue
        }

        try {
          const msg = await asst.setActiveProject(subcommand)
          await sock.sendMessage(jid, { text: msg })
        } catch (e) {
          await sock.sendMessage(jid, { text: `Error: ${(e as Error).message}` })
        }
        continue
      }

      if (text.startsWith("/remember")) {
        const note = text.slice("/remember".length).trim()
        if (!note) {
          await sock.sendMessage(jid, { text: "Usage: /remember <text>" })
          continue
        }
        await opts.assistant.remember(note, `whatsapp:${jid}`)
        await sock.sendMessage(jid, { text: "Saved to long-term memory." })
        continue
      }

      let answer: string
      try {
        answer = await opts.assistant.ask({
          channel: "whatsapp",
          userID: jid,
          text,
        })
      } catch (error) {
        opts.logger.error({ error, jid }, "whatsapp ask failed")
        await sock.sendMessage(jid, { text: "I hit an internal error while preparing the reply. Check server logs." })
        continue
      }

      const chunks = splitTextChunks(answer, 3500)
      for (const chunk of chunks) {
        await sock.sendMessage(jid, { text: chunk })
      }
      opts.logger.info({ jid, answerLength: answer.length, chunkCount: chunks.length }, "whatsapp reply sent")
    }
  })

  setInterval(() => {
    void flushOutbox()
  }, 60000)
}
