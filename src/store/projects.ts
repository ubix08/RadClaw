import { ensureDir, readJson, writeJson } from "../utils/fs"
import { dirname, resolvePath } from "../utils/path"
import { readdir, mkdir } from "fs/promises"

export type Project = {
  name: string
  path: string
  addedAt: number
}

type ProjectData = {
  projects: Project[]
  activeName: string | null
}

function defaultData(): ProjectData {
  return { projects: [], activeName: null }
}

export class ProjectStore {
  private data: ProjectData = defaultData()

  constructor(private readonly filePath: string) {}

  async init(): Promise<void> {
    await ensureDir(dirname(this.filePath))
    try {
      const parsed = await readJson<Partial<ProjectData>>(this.filePath)
      this.data = {
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
        activeName: typeof parsed.activeName === "string" ? parsed.activeName : null,
      }
    } catch {
      this.data = defaultData()
    }
    await this.persist()
  }

  /** Auto-discover projects from ~/projects/ and register unknown ones. Returns count of new projects. */
  async discoverProjects(): Promise<number> {
    const home = process.env.HOME || "/root"
    const projectsDir = resolvePath(home, "projects")
    try {
      await mkdir(projectsDir, { recursive: true })
      const entries = await readdir(projectsDir, { withFileTypes: true })
      const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
      let added = 0
      for (const name of dirs) {
        const exists = this.data.projects.some((p) => p.name === name)
        if (!exists) {
          this.data.projects.push({
            name,
            path: resolvePath(projectsDir, name),
            addedAt: Date.now(),
          })
          added++
        }
      }
      if (added > 0) await this.persist()
      return added
    } catch {
      return 0
    }
  }

  list(): Project[] {
    return this.data.projects
  }

  active(): Project | null {
    if (!this.data.activeName) return null
    return this.data.projects.find((p) => p.name === this.data.activeName) ?? null
  }

  get(name: string): Project | undefined {
    return this.data.projects.find((p) => p.name === name)
  }

  async setActive(name: string): Promise<Project> {
    const project = this.get(name)
    if (!project) throw new Error(`Project "${name}" not found`)
    this.data.activeName = project.name
    await this.persist()
    return project
  }

  async add(name: string, path: string): Promise<Project> {
    const existing = this.get(name)
    if (existing) throw new Error(`Project "${name}" already exists`)
    const project: Project = { name, path: resolvePath(Bun.cwd, path), addedAt: Date.now() }
    this.data.projects.push(project)
    await this.persist()
    return project
  }

  async remove(name: string): Promise<void> {
    this.data.projects = this.data.projects.filter((p) => p.name !== name)
    if (this.data.activeName === name) this.data.activeName = null
    await this.persist()
  }

  formatList(): string {
    const active = this.active()
    const lines = this.data.projects.map((p) => {
      const marker = p.name === active?.name ? " *" : "  "
      return `${marker} ${p.name}  (${p.path})`
    })
    return lines.length === 0 ? "No projects configured." : lines.join("\n")
  }

  private async persist(): Promise<void> {
    await writeJson(this.filePath, this.data)
  }
}
