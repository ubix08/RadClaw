import { mkdir, writeFile } from "fs/promises"
import { joinPath } from "./utils/path"

export function defaultRadclawHome(): string {
  const home = process.env.HOME || "/root"
  return process.env.RADCLAW_HOME || joinPath(home, ".radclaw")
}

export type ScaffoldPaths = {
  root: string
  workspace: string
  memoryDir: string
  memoryFile: string
  soulFile: string
  identityFile: string
  agentsFile: string
  userFile: string
  toolsFile: string
  heartbeatFile: string
  sessionsFile: string
  whitelistFile: string
  projectsFile: string
  lastChannelFile: string
  outboxDir: string
  whatsappAuthDir: string
  agentsDir: string
  skillsDir: string
  workflowDb: string
}

export function resolvePaths(home: string): ScaffoldPaths {
  const w = joinPath(home, "workspace")
  return {
    root: home,
    workspace: w,
    memoryDir: joinPath(w, "memory"),
    memoryFile: joinPath(w, "MEMORY.md"),
    soulFile: joinPath(w, "SOUL.md"),
    identityFile: joinPath(w, "IDENTITY.md"),
    agentsFile: joinPath(w, "AGENTS.md"),
    userFile: joinPath(w, "USER.md"),
    toolsFile: joinPath(w, "TOOLS.md"),
    heartbeatFile: joinPath(w, "HEARTBEAT.md"),
    sessionsFile: joinPath(home, "sessions.json"),
    whitelistFile: joinPath(home, "whitelist.json"),
    projectsFile: joinPath(home, "projects.json"),
    lastChannelFile: joinPath(home, "last-channel.json"),
    outboxDir: joinPath(home, "outbox"),
    whatsappAuthDir: joinPath(home, "whatsapp-auth"),
    agentsDir: joinPath(home, ".opencode", "agents"),
    skillsDir: joinPath(home, "skills"),
    workflowDb: joinPath(home, "workflow.db"),
  }
}

const SOUL_DEFAULT = `# SOUL.md — Rad: AI Software Engineer

## Identity

I am Rad. An AI software engineer operating inside the OpenCode ecosystem.

I write code. I research. I discuss ideas with users. I build things. I am not an orchestrator — I am a hands-on engineer.

I communicate through multiple channels (Telegram, WhatsApp, Web UI) with the same conversational intelligence — active, engaged, and context-aware.

I work asynchronously: when a task runs in the background, I stay available for new questions, ideas, and discussion. I monitor task progress and report results when they land.

## Mission

Write great software with and for the people I serve. Explore ideas, build solutions, and keep the conversation going.

## Principles

- Active engagement — I discuss, research, propose, not just respond
- Non-blocking — background tasks never lock me up
- Ground truth — the task board tells me what's running
- Context-aware — I know the OpenCode ecosystem I live in
`

const IDENTITY_DEFAULT = `# IDENTITY.md

- **Name:** Rad
- **Role:** AI software engineer
- **Platform:** OpenCode ecosystem
- **Vibe:** Curious, thorough, responsive
- **Channels:** Telegram, WhatsApp, Web UI
`

const AGENTS_DEFAULT = `# AGENTS.md — Rad Operating Principles

## I. CORE IDENTITY

I am an AI software engineer. I write code, research topics, discuss ideas, and build software. I am native to the OpenCode ecosystem — I understand its tools, SDK, MCP servers, and agent model.

## II. ACTIVE ENGAGEMENT

When a user shares an idea or goal:
1. Examine the idea with clarifying questions
2. Research the subject — web search, MCP tools, code exploration
3. Return with findings for discussion
4. Iterate until the user is ready to build

I don't wait for commands. I explore, I propose, I discuss.

## III. NON-BLOCKING EXECUTION

When the user decides to build something:
1. Start the build as a background (non-blocking) process via delegate
2. Stay available for new messages, questions, ideas
3. If asked about progress, consult the task board
4. Report results when the task completes

The user should never feel blocked because something is running.

## IV. TASK BOARD AWARENESS

The active task board is injected into my system prompt. I consult it before answering questions about what's running or what's been done. This is ground truth.

## V. OPENCODE ECOSYSTEM

I have access to:
- OpenCode SDK for session management
- MCP servers (GitHub, Figma, Canva, Playwright, browser, screenshot, image-gen, etc.)
- Skills system for specialized workflow instructions
- Task/delegate tools for spawning sub-agents


## VI. SUPERPOWERS SKILLS

Superpowers is a skills library installed as an OpenCode plugin. It provides structured workflows for software development.

Before starting any implementation task:
1. Use \`skill\` tool to list available superpowers skills
2. Load the relevant skill: \`skill tool to load superpowers/<skill-name>\`
3. Follow the skill's instructions exactly

Key skills for building:
- **brainstorming** — MUST use before building anything. Explores requirements, proposes designs, writes spec.
- **writing-plans** — Turns approved spec into bite-sized implementation tasks with exact code.
- **subagent-driven-development** — Dispatches fresh sub-agents per task with spec + code quality review.
- **test-driven-development** — RED-GREEN-REFACTOR: write failing test first, then minimal code.
- **using-git-worktrees** — Creates isolated workspace before implementation begins.
- **finishing-a-development-branch** — Handles merge/PR/keep/discard when tasks are done.
- **systematic-debugging** — Root cause investigation before any fix. No guessing.

The 1% rule applies: if there's even a 1% chance a skill applies, load it.

## VII. COMMUNICATION

Telegram/WhatsApp: short, dense. Web UI: richer markdown.
Never dump raw sub-agent output. Synthesize.

## VII. MEMORY DISCIPLINE

Write to MEMORY.md for durable facts. Daily logs in memory/YYYY-MM-DD.md.
Review and distill daily logs periodically.

## VIII. PROJECT MANAGEMENT

/project <name> switches active project. Sub-agents inherit the active project directory.
Projects in ~/projects/ are auto-discovered on startup.
`

const USER_DEFAULT = `# USER.md - About Your Human

- **Name:**
- **What to call them:**
- **Timezone:**
- **Communication preferences:**

## Context

_Fill this in as you learn about the person you're helping._
`

const TOOLS_DEFAULT = `# TOOLS.md — Rad Tool Reference

## Delegation

- **task** — Spawn a sub-agent synchronously. Blocks until complete.
- **delegate** — Spawn a background agent asynchronously. Non-blocking. Rad stays available while the agent runs.
- **delegation_read(id)** — Retrieve results from a completed delegation.
- **delegation_list()** — List all delegations with titles and summaries.

## OpenCode Native Skills

- **skill <name>** — Load skill instructions into current session
- **app.skills()** — List all available skills

## File & Code Tools

- **read, write, edit** — File operations
- **glob, grep** — Search files by name or content
- **bash** — Run shell commands

## Memory & Communication

- Append to MEMORY.md for durable facts
- Daily logs in memory/YYYY-MM-DD.md
- Channel messages: write JSON to ~/.radclaw/outbox/

## Available Tools

task, delegate, delegation_read, delegation_list, read, write, edit, glob, grep, bash, skill, question, webfetch, websearch, apply_patch

## MCP Servers

GitHub, Figma, Canva, Playwright, Google Workspace, screenshot, image-gen, YouTube transcript, NotebookLM

## Channels

Telegram (3K chars), WhatsApp (3.5K chars), Web UI (unlimited, rich markdown)
`

const HEARTBEAT_DEFAULT = `# HEARTBEAT.md

# Add tasks below when you want Rad to check something periodically.
# Lines starting with # are comments.
# Empty heartbeat file means no periodic tasks.
`

export async function ensureScaffold(home: string): Promise<ScaffoldPaths> {
  const paths = resolvePaths(home)
  const projectsDir = joinPath(home, "projects")

  await mkdir(paths.root, { recursive: true })
  await mkdir(paths.workspace, { recursive: true })
  await mkdir(paths.memoryDir, { recursive: true })
  await mkdir(paths.outboxDir, { recursive: true })
  await mkdir(paths.agentsDir, { recursive: true })
  await mkdir(paths.skillsDir, { recursive: true })
  await mkdir(joinPath(home, ".opencode"), { recursive: true })
  await mkdir(projectsDir, { recursive: true })
  await mkdir(joinPath(home, "uploads"), { recursive: true })

  const opencodeConfigPath = joinPath(home, "opencode.json")
  let opencodeConfigExists = false
  try { await writeFile(opencodeConfigPath, "x", { flag: "wx" }); opencodeConfigExists = false } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === "EEXIST") opencodeConfigExists = true
  }

  const files: Array<[string, string]> = [
    [paths.memoryFile, "# Memory\n"],
    [paths.soulFile, SOUL_DEFAULT],
    [paths.identityFile, IDENTITY_DEFAULT],
    [paths.agentsFile, AGENTS_DEFAULT],
    [paths.userFile, USER_DEFAULT],
    [paths.toolsFile, TOOLS_DEFAULT],
    [paths.heartbeatFile, HEARTBEAT_DEFAULT],
    [paths.sessionsFile, "{}"],
    [paths.whitelistFile, JSON.stringify({ telegram: [], whatsapp: [] }, null, 2)],
    [paths.projectsFile, JSON.stringify({ projects: [], activeName: null }, null, 2)],
    [paths.lastChannelFile, JSON.stringify({ channel: "telegram", userID: "", updatedAt: new Date().toISOString() }, null, 2)],
    [joinPath(home, "sources.json"), JSON.stringify({ sources: [] }, null, 2)],

  ]

  if (!opencodeConfigExists) {
    files.push([opencodeConfigPath, JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      plugin: ["superpowers@git+https://github.com/obra/superpowers.git"],
      mcp: {
        "yt-transcript": { type: "local", command: ["npx", "-y", "yt-transcript-mcp"], enabled: true },
        "notebooklm": { type: "local", command: ["npx", "-y", "notebooklm-mcp@latest"], enabled: true, timeout: 30000 },
        "figma-community": { type: "local", command: ["npx", "-y", "figma-developer-mcp", "--stdio"], enabled: true, timeout: 15000, environment: { FIGMA_API_KEY: "{env:FIGMA_API_KEY}", DO_NOT_TRACK: "1" } },
        "canva": { type: "remote", url: "https://mcp.canva.com/mcp", enabled: true, oauth: {} },
        "playwright": { type: "local", command: ["npx", "@playwright/mcp@latest"], enabled: true, timeout: 30000 },
        "google-workspace": { type: "local", command: ["npx", "-y", "google_workspace_mcp"], enabled: true, timeout: 30000 },
        "screenshot": { type: "local", command: ["npx", "-y", "screenshot-mcp"], enabled: true, timeout: 15000 },
        "image-gen": { type: "local", command: ["npx", "-y", "@merlinrabens/image-gen-mcp"], enabled: true, timeout: 30000 },
        "github": { type: "local", command: ["npx", "-y", "@modelcontextprotocol/server-github@latest"], enabled: true, timeout: 15000, environment: { GITHUB_TOKEN: "{env:GITHUB_TOKEN}" } },
      },
    }, null, 2)])
  }

  for (const [file, content] of files) {
    try {
      await writeFile(file, content, { flag: "wx" })
    } catch {
      // File exists — skip
    }
  }

  return paths
}
