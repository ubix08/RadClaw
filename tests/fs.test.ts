import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { ensureDir, readText, writeText, readJson, writeJson, listFiles, removeFile, writeBinary } from "../src/utils/fs"

let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "radclaw-test-"))
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe("ensureDir", () => {
  it("creates nested directories", async () => {
    await ensureDir(`${tmp}/a/b/c`)
    const { statSync } = await import("fs")
    expect(statSync(`${tmp}/a/b/c`).isDirectory()).toBe(true)
  })
})

describe("writeText / readText", () => {
  it("writes and reads text", async () => {
    await writeText(`${tmp}/hello.txt`, "Hello World")
    expect(await readText(`${tmp}/hello.txt`)).toBe("Hello World")
  })
  it("creates parent dirs automatically", async () => {
    await writeText(`${tmp}/deep/nested/file.txt`, "content")
    expect(await readText(`${tmp}/deep/nested/file.txt`)).toBe("content")
  })
})

describe("writeJson / readJson", () => {
  it("writes and reads JSON", async () => {
    const data = { foo: [1, 2, 3], bar: "baz" }
    await writeJson(`${tmp}/data.json`, data)
    expect(await readJson<typeof data>(`${tmp}/data.json`)).toEqual(data)
  })
})

describe("listFiles", () => {
  it("lists only files", async () => {
    await writeText(`${tmp}/a.txt`, "")
    await writeText(`${tmp}/b.txt`, "")
    await ensureDir(`${tmp}/subdir`)
    const files = await listFiles(tmp)
    expect(files.sort()).toEqual(["a.txt", "b.txt"])
  })
  it("returns empty for missing dir", async () => {
    expect(await listFiles(`${tmp}/nonexistent`)).toEqual([])
  })
})

describe("removeFile", () => {
  it("removes existing file", async () => {
    await writeText(`${tmp}/x.txt`, "")
    await removeFile(`${tmp}/x.txt`)
    expect(await listFiles(tmp)).toEqual([])
  })
  it("does not throw for missing file", async () => {
    await removeFile(`${tmp}/missing.txt`)
  })
})

describe("writeBinary", () => {
  it("writes binary data", async () => {
    const buf = new Uint8Array([0, 1, 2, 255])
    await writeBinary(`${tmp}/bin.dat`, buf)
    const { readFileSync } = await import("fs")
    expect([...readFileSync(`${tmp}/bin.dat`)]).toEqual([0, 1, 2, 255])
  })
})
