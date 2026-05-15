import { ensureDir, readText, writeText } from "./fs"
import { dirname, resolvePath } from "./path"
import { defaultRadclawHome } from "../bootstrap"

export type EnvMap = Record<string, string>

export function envFilePath(): string {
  return resolvePath(defaultRadclawHome(), ".env")
}

export function parseEnv(lines: string[]): EnvMap {
  const out: EnvMap = {}
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const idx = trimmed.indexOf("=")
    if (idx <= 0) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1)
    out[key] = value
  }
  return out
}

export function updateEnvLines(lines: string[], updates: EnvMap): string[] {
  const out = [...lines]
  const seen = new Set<string>()
  for (let i = 0; i < out.length; i += 1) {
    const line = out[i]
    const idx = line.indexOf("=")
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      out[i] = `${key}=${updates[key]}`
      seen.add(key)
    }
  }
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) out.push(`${key}=${value}`)
  }
  return out
}

export async function loadEnvFile(): Promise<string[]> {
  try {
    const raw = await readText(envFilePath())
    return raw.split(/\r?\n/)
  } catch {
    return []
  }
}

export async function saveEnvFile(lines: string[]): Promise<void> {
  const f = envFilePath()
  await ensureDir(dirname(f))
  await writeText(f, lines.join("\n").trimEnd() + "\n")
}

export async function readEnv(): Promise<EnvMap> {
  const lines = await loadEnvFile()
  return parseEnv(lines)
}

export async function writeEnv(updates: EnvMap): Promise<EnvMap> {
  const lines = await loadEnvFile()
  const updated = updateEnvLines(lines, updates)
  await saveEnvFile(updated)
  return parseEnv(updated)
}
