import { tool } from "@opencode-ai/plugin"
import { joinPath } from "./_util.js"

const radHome = () => process.env.RADCLAW_HOME || joinPath(process.env.HOME, ".radclaw")
const lastChannelFile = joinPath(radHome(), "last-channel.json")
const outboxDir = joinPath(radHome(), "outbox")

async function run(cmd) {
  const proc = Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" })
  await proc.exited
}

export default async () => {
  return {
    tool: {
      send_channel_message: tool({
        description: "Queue a proactive message to the last used chat channel/user.",
        args: {
          text: tool.schema.string().describe("Plain-text message to send"),
        },
        async execute(args) {
          const text = args.text.trim()
          if (!text) return "Skipped: empty message."

          let target
          try {
            const raw = await Bun.file(lastChannelFile).text()
            target = JSON.parse(raw)
          } catch {
            return "No last-used channel found yet."
          }

          if (
            !target ||
            (target.channel !== "telegram" && target.channel !== "whatsapp") ||
            typeof target.userID !== "string"
          ) {
            return "Last-used channel data is invalid."
          }

          await run(["mkdir", "-p", outboxDir])
          const filePath = joinPath(outboxDir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`)
          await Bun.write(
            filePath,
            JSON.stringify(
              {
                channel: target.channel,
                userID: target.userID,
                text,
                createdAt: new Date().toISOString(),
              },
              null,
              2,
            ),
          )

          return `Queued message for ${target.channel}:${target.userID}`
        },
      }),
    },
  }
}
