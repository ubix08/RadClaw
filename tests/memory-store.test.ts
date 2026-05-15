import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { MemoryStore } from "../src/memory/store"

let tmp: string
let store: MemoryStore

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "radclaw-test-"))
  store = new MemoryStore(tmp)
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe("MemoryStore", () => {
  it("init creates MEMORY.md", async () => {
    await store.init()
    const content = await store.readAll()
    expect(content).toBe("# Memory\n")
  })

  it("append adds a note", async () => {
    await store.init()
    await store.append("Hello")
    const content = await store.readAll()
    expect(content).toContain("- Hello")
  })

  it("append with source includes source prefix", async () => {
    await store.init()
    await store.append("test note", "web:user")
    const content = await store.readAll()
    expect(content).toContain("(web:user) test note")
  })

  it("multiple appends accumulate", async () => {
    await store.init()
    await store.append("First")
    await store.append("Second")
    const content = await store.readAll()
    expect(content).toContain("- First")
    expect(content).toContain("- Second")
  })

  it("readAll creates file if missing", async () => {
    const content = await store.readAll()
    expect(content).toBe("# Memory\n")
  })
})
