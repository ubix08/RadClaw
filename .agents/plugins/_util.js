const SEP = "/"

export function joinPath(...parts) {
  return parts
    .filter((part) => part !== "")
    .map((part, index) => {
      if (index === 0) return part.replace(/\/+$/g, "")
      return part.replace(/^\/+/g, "").replace(/\/+$/g, "")
    })
    .filter(Boolean)
    .join(SEP)
}

export function basename(input) {
  const idx = input.lastIndexOf(SEP)
  return idx === -1 ? input : input.slice(idx + 1)
}

export function dirname(input) {
  const idx = input.lastIndexOf(SEP)
  if (idx <= 0) return "."
  return input.slice(0, idx)
}
