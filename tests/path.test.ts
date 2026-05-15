import { describe, it, expect } from "bun:test"
import { joinPath, resolvePath, dirname, basename, relativePath } from "../src/utils/path"

describe("joinPath", () => {
  it("joins two path segments", () => {
    expect(joinPath("a", "b")).toBe("a/b")
  })
  it("joins multiple segments", () => {
    expect(joinPath("a", "b", "c")).toBe("a/b/c")
  })
  it("strips trailing slashes", () => {
    expect(joinPath("a/", "b/")).toBe("a/b")
  })
  it("strips leading slashes from non-first segments", () => {
    expect(joinPath("a", "/b")).toBe("a/b")
  })
  it("filters empty segments", () => {
    expect(joinPath("a", "", "b")).toBe("a/b")
  })
})

describe("resolvePath", () => {
  it("joins relative paths", () => {
    expect(resolvePath("/base", "sub")).toBe("/base/sub")
  })
  it("absolute path resets base", () => {
    expect(resolvePath("/base", "/abs")).toBe("/abs")
  })
  it("handles empty segments", () => {
    expect(resolvePath("/base", "")).toBe("/base")
  })
})

describe("dirname", () => {
  it("returns parent directory", () => {
    expect(dirname("/a/b/c.txt")).toBe("/a/b")
  })
  it("returns . for single segment", () => {
    expect(dirname("file.txt")).toBe(".")
  })
  it("handles root", () => {
    expect(dirname("/")).toBe(".")
  })
})

describe("basename", () => {
  it("returns last path component", () => {
    expect(basename("/a/b/file.txt")).toBe("file.txt")
  })
  it("returns same for single segment", () => {
    expect(basename("file.txt")).toBe("file.txt")
  })
})

describe("relativePath", () => {
  it("returns relative path", () => {
    expect(relativePath("/base", "/base/sub/file.txt")).toBe("sub/file.txt")
  })
  it("returns empty for same path", () => {
    expect(relativePath("/base", "/base")).toBe("")
  })
  it("returns original if not under base", () => {
    expect(relativePath("/base", "/other")).toBe("/other")
  })
})
