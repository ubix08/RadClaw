import { tool } from "@opencode-ai/plugin"
import { joinPath, dirname } from "./_util.js"

const radHome = () => process.env.RADCLAW_HOME || joinPath(process.env.HOME, ".radclaw")
const memoryFile = joinPath(radHome(), "workspace", "MEMORY.md")

async function run(cmd) {
  const proc = Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" })
  await proc.exited
}

async function ensureMemoryFile() {
  await run(["mkdir", "-p", dirname(memoryFile)])
  try {
    await Bun.file(memoryFile).text()
  } catch {
    await Bun.write(memoryFile, "# Memory\n")
  }
}

export default async () => {
  return {
    tool: {
      save_memory: tool({
        description: "Append one durable user fact to .data/workspace/MEMORY.md",
        args: {
          fact: tool.schema.string().describe("A short, stable user fact worth remembering"),
        },
        async execute(args) {
          const fact = args.fact.trim()
          if (!fact) return "Skipped: empty memory fact."
          await ensureMemoryFile()
          const existing = await Bun.file(memoryFile).text()
          await Bun.write(memoryFile, `${existing}- ${fact}\n`)
          return "Saved durable memory."
        },
      }),
    },
  }
}
