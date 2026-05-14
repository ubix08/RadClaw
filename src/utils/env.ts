import { ensureDir, readText, writeText } from "./fs"
import { dirname, joinPath, resolvePath } from "./path"

export type EnvMap = Record<string, string>

const REPO_ROOT = resolvePath(import.meta.dir, "..", "..")
const ENV_FILE = resolvePath(REPO_ROOT, ".env")

export function envFilePath(): string {
  return ENV_FILE
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
    const raw = await readText(ENV_FILE)
    return raw.split(/\r?\n/)
  } catch {
    return []
  }
}

export async function saveEnvFile(lines: string[]): Promise<void> {
  await ensureDir(dirname(ENV_FILE))
  await writeText(ENV_FILE, lines.join("\n").trimEnd() + "\n")
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
