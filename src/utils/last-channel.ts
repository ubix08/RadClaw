import { ensureDir, writeText } from "./fs"
import { dirname, joinPath } from "./path"

export type LastChannel = {
  channel: "telegram" | "whatsapp"
  userID: string
  updatedAt: string
}

function radclawHome(): string {
  return process.env.RADCLAW_HOME || joinPath(process.env.HOME || "/root", ".radclaw")
}

export async function saveLastChannel(channel: LastChannel["channel"], userID: string): Promise<void> {
  const file = joinPath(radclawHome(), "last-channel.json")
  await ensureDir(dirname(file))
  await writeText(
    file,
    JSON.stringify(
      {
        channel,
        userID,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  )
}
