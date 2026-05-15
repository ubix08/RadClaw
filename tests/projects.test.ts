import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { ProjectStore } from "../src/store/projects"

describe("ProjectStore", () => {
  let tmp: string
  let store: ProjectStore

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "radclaw-proj-"))
    store = new ProjectStore(join(tmp, "projects.json"))
  })

  afterEach(() => {
    try { rmSync(tmp, { recursive: true, force: true }) } catch {}
  })

  it("init creates empty store", async () => {
    await store.init()
    expect(store.list()).toEqual([])
    expect(store.active()).toBeNull()
  })

  it("add inserts a project", async () => {
    await store.init()
    const p = await store.add("my-project", "/some/path")
    expect(p.name).toBe("my-project")
    expect(store.list()).toHaveLength(1)
  })

  it("add throws for duplicate name", async () => {
    await store.init()
    await store.add("dup", "/p1")
    expect(store.add("dup", "/p2")).rejects.toThrow("already exists")
  })

  it("setActive marks the active project", async () => {
    await store.init()
    await store.add("alpha", "/a")
    await store.add("beta", "/b")
    const active = await store.setActive("alpha")
    expect(active.name).toBe("alpha")
    expect(store.active()?.name).toBe("alpha")
  })

  it("setActive throws for missing project", async () => {
    await store.init()
    expect(store.setActive("nope")).rejects.toThrow("not found")
  })

  it("remove deletes a project", async () => {
    await store.init()
    await store.add("temp", "/x")
    await store.remove("temp")
    expect(store.list()).toHaveLength(0)
  })

  it("remove clears active if active project is removed", async () => {
    await store.init()
    await store.add("primary", "/p")
    await store.setActive("primary")
    await store.remove("primary")
    expect(store.active()).toBeNull()
  })

  it("get returns project by name or undefined", async () => {
    await store.init()
    await store.add("found", "/f")
    expect(store.get("found")?.name).toBe("found")
    expect(store.get("missing")).toBeUndefined()
  })

  it("formatList returns formatted text with projects", async () => {
    await store.init()
    await store.add("alpha", "/path/a")
    await store.add("beta", "/path/b")
    await store.setActive("alpha")
    const list = store.formatList()
    expect(list).toContain("alpha")
    expect(list).toContain("beta")
    expect(list).toContain("*")
  })

  it("formatList returns empty message when no projects", async () => {
    await store.init()
    expect(store.formatList()).toBe("No projects configured.")
  })

  it("persists and reloads state across store instances", async () => {
    await store.init()
    await store.add("persisted", "/p")
    await store.setActive("persisted")
    const store2 = new ProjectStore(join(tmp, "projects.json"))
    await store2.init()
    expect(store2.list()).toHaveLength(1)
    expect(store2.active()?.name).toBe("persisted")
  })
})

describe("ProjectStore discovery", () => {
  let tmp: string
  let store: ProjectStore
  let origHome: string | undefined

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "radclaw-proj-"))
    store = new ProjectStore(join(tmp, "projects.json"))
    origHome = process.env.HOME
    process.env.HOME = tmp
  })

  afterEach(() => {
    process.env.HOME = origHome
    try { rmSync(tmp, { recursive: true, force: true }) } catch {}
  })

  it("discoverProjects finds new dirs in ~/projects/", async () => {
    await store.init()
    mkdirSync(join(tmp, "projects", "my-project"), { recursive: true })
    const count = await store.discoverProjects()
    expect(count).toBe(1)
    expect(store.get("my-project")).toBeDefined()
  })

  it("discoverProjects skips already registered", async () => {
    await store.init()
    mkdirSync(join(tmp, "projects", "existing"), { recursive: true })
    await store.add("existing", join(tmp, "projects", "existing"))
    const count = await store.discoverProjects()
    expect(count).toBe(0)
  })
})
