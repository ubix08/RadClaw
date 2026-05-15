import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { SessionStore } from "../src/core/session-store"

let tmp: string
let filePath: string
let store: SessionStore

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "radclaw-test-"))
  filePath = join(tmp, "sessions.json")
  store = new SessionStore(filePath)
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe("SessionStore", () => {
  it("init creates sessions.json", async () => {
    await store.init()
    const { readText } = await import("../src/utils/fs")
    const raw = await readText(filePath)
    expect(raw).toBeTruthy()
  })

  it("main session ID round-trips", async () => {
    await store.init()
    expect(store.getMainSessionID()).toBeUndefined()
    await store.setMainSessionID("session-abc")
    expect(store.getMainSessionID()).toBe("session-abc")
  })

  it("heartbeat session ID round-trips", async () => {
    await store.init()
    expect(store.getHeartbeatSessionID()).toBeUndefined()
    await store.setHeartbeatSessionID("hb-123")
    expect(store.getHeartbeatSessionID()).toBe("hb-123")
  })

  it("persists and reloads main session ID", async () => {
    await store.init()
    await store.setMainSessionID("persist-test")
    const store2 = new SessionStore(filePath)
    await store2.init()
    expect(store2.getMainSessionID()).toBe("persist-test")
  })

  it("frontend session mapping round-trips", async () => {
    await store.init()
    expect(store.getFrontendSession("fe-1")).toBeUndefined()
    await store.setFrontendSession("fe-1", "oc-1")
    expect(store.getFrontendSession("fe-1")).toBe("oc-1")
  })

  it("incrementMessageCount increases count", async () => {
    await store.init()
    await store.setFrontendSession("fe-1", "oc-1")
    await store.incrementMessageCount("fe-1", 2)
    const meta = store.getFrontendSessionMeta("fe-1")
    expect(meta?.messageCount).toBe(2)
  })

  it("removeFrontendSession removes and returns true", async () => {
    await store.init()
    await store.setFrontendSession("fe-1", "oc-1")
    expect(await store.removeFrontendSession("fe-1")).toBe(true)
    expect(store.getFrontendSession("fe-1")).toBeUndefined()
  })

  it("removeFrontendSession returns false for missing", async () => {
    await store.init()
    expect(await store.removeFrontendSession("nonexistent")).toBe(false)
  })

  it("listFrontendSessions returns all sessions", async () => {
    await store.init()
    await store.setFrontendSession("fe-1", "oc-1")
    await store.setFrontendSession("fe-2", "oc-2")
    const list = store.listFrontendSessions()
    expect(list).toHaveLength(2)
    expect(list.find((s) => s.frontendId === "fe-1")?.opencodeId).toBe("oc-1")
  })

  it("frontendSessionCount returns correct count", async () => {
    await store.init()
    expect(store.frontendSessionCount()).toBe(0)
    await store.setFrontendSession("fe-1", "oc-1")
    expect(store.frontendSessionCount()).toBe(1)
  })
})
