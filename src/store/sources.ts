import { ensureDir, readJson, writeJson } from "../utils/fs"
import { dirname } from "../utils/path"
import { randomUUID } from "node:crypto"

export type SourceType = "url" | "youtube" | "image" | "text" | "pdf" | "spreadsheet"

export type Source = {
  id: string
  type: SourceType
  title: string
  url?: string
  content: string
  addedAt: number
}

type SourceData = {
  sources: Source[]
}

function defaultData(): SourceData {
  return { sources: [] }
}

export class SourceStore {
  private data: SourceData = defaultData()

  constructor(private readonly filePath: string) {}

  async init(): Promise<void> {
    await ensureDir(dirname(this.filePath))
    try {
      const parsed = await readJson<Partial<SourceData>>(this.filePath)
      this.data = {
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      }
    } catch {
      this.data = defaultData()
    }
    await this.persist()
  }

  list(): Source[] {
    return this.data.sources
  }

  get(id: string): Source | undefined {
    return this.data.sources.find((s) => s.id === id)
  }

  async add(input: { type: SourceType; title: string; url?: string; content: string }): Promise<Source> {
    const source: Source = {
      id: randomUUID(),
      type: input.type,
      title: input.title,
      url: input.url,
      content: input.content,
      addedAt: Date.now(),
    }
    this.data.sources.push(source)
    await this.persist()
    return source
  }

  async remove(id: string): Promise<void> {
    this.data.sources = this.data.sources.filter((s) => s.id !== id)
    await this.persist()
  }

  formatContext(): string {
    if (this.data.sources.length === 0) return ""
    const lines = this.data.sources.map((s) => {
      const urlInfo = s.url ? ` (${s.url})` : ""
      return `  [${s.type}] ${s.title}${urlInfo}`
    })
    return lines.join("\n")
  }

  private async persist(): Promise<void> {
    await writeJson(this.filePath, this.data)
  }
}
