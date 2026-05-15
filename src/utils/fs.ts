import { mkdir, readFile, writeFile, readdir, rm } from "fs/promises"
import { dirname } from "./path"

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

export async function readText(file: string): Promise<string> {
  return await readFile(file, "utf-8")
}

export async function writeText(file: string, text: string): Promise<void> {
  await ensureDir(dirname(file))
  await writeFile(file, text, "utf-8")
}

export async function readJson<T>(file: string): Promise<T> {
  const raw = await readText(file)
  return JSON.parse(raw) as T
}

export async function writeJson(file: string, data: unknown): Promise<void> {
  await writeText(file, JSON.stringify(data, null, 2))
}

export async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries.filter((e) => e.isFile()).map((e) => e.name)
  } catch {
    return []
  }
}

export async function removeFile(file: string): Promise<void> {
  try {
    await rm(file, { force: true })
  } catch {
    // Ignore if file doesn't exist
  }
}

export async function writeBinary(file: string, data: Uint8Array): Promise<void> {
  await ensureDir(dirname(file))
  await writeFile(file, data)
}
