# Rad: Repository Guide

Rad is an orchestrator agent on top of the OpenCode SDK.
OpenCode handles core agent/runtime behavior; Rad adds identity files, channels, memory, heartbeat tasks, project management, and a few tools.

**Connection model:** Always connects to an existing OpenCode server (never spawns one). Defaults to `http://127.0.0.1:4096`. Set `OPENCODE_SERVER_URL` to override.

**Workspace:** `~/.radclaw/` — fully OpenClaw-compatible workspace structure with SOUL.md, IDENTITY.md, AGENTS.md, USER.md, TOOLS.md, HEARTBEAT.md, MEMORY.md, and daily logs in `workspace/memory/`.

## Design Goals

- Keep custom code small ("less is more").
- Reuse OpenCode-native mechanisms (auth, sessions, tools/plugins).
- Persist only essential state on disk.
- Share one main conversation session across channels.
- Adopt OpenClaw workspace file conventions for agent identity.

## Runtime Overview

Entry point: `src/index.ts`

Startup flow:
1. Load config from `src/config.ts`.
2. Bootstrap `~/.radclaw/` workspace if first run (scaffolds identity files).
3. Initialize `AssistantCore`, `MemoryStore`, `SessionStore`, `WhitelistStore`.
4. Start Telegram/WhatsApp adapters.
5. Start heartbeat scheduler if `workspace/HEARTBEAT.md` has tasks.

## OpenCode Integration

`AssistantCore` (`src/core/assistant.ts`) owns OpenCode client usage:
- One shared **main** OpenCode session across all channels.
- One separate **heartbeat** session.
- Always connects to an existing OpenCode server (never spawns one).
- Each user message uses `session.prompt` with a dynamic `system` prompt.
- Falls back to message polling only if prompt output cannot be parsed.

Model selection:
- `OPENCODE_MODEL` if set.
- Else first recent model in `~/.local/state/opencode/model.json` (`XDG_STATE_HOME` respected).

## Channels

Telegram: `src/channels/telegram.ts`
- `grammy`
- `/pair`, `/new`, `/remember`
- typing indicator

WhatsApp: `src/channels/whatsapp.ts`
- `@whiskeysockets/baileys`
- `/pair`, `/new`, `/remember`
- QR login + reconnect

Both enforce whitelist and chunk long replies.

## Memory

Single file: `.data/workspace/MEMORY.md`

- Always injected into the system prompt.
- Assistant must call `save_memory` for durable facts.
- `/remember` command still appends directly.
- Daily logs stored in `workspace/memory/YYYY-MM-DD.md`.

No search, no embeddings, no extra memory files.

## Projects

File: `.data/projects.json`, `src/store/projects.ts`

- Active-project model: one project active at a time.
- Session directory is set to the active project's path when creating sessions.
- **Auto-discovery**: Rad scans `~/projects/` on startup and registers unknown directories as projects.
- Commands: `/project`, `/project add <name> <path>`, `/project remove <name>`, `/project <name>` (switch).
- API: `GET /api/projects`, `POST /api/projects/set`, `POST /api/projects/add`, `POST /api/projects/remove`.
- Project list and active project are injected into the system prompt.
- Spawned sub-agent sessions inherit the active project directory.

## Heartbeat (Cron Tasks)

Files: `workspace/HEARTBEAT.md`, `src/scheduler/heartbeat.ts`

- One task per line (comments start with `#`).
- Runs in its own session.
- Uses the same system prompt + memory.
- Adds a short recent main-session context snippet.
- Writes summary back into main session.
- Then asks the agent whether to notify the user.

## Proactive Messaging

Tool: `send_channel_message` (plugin)

Flow:
1. Agent decides to notify.
2. Tool writes to `.data/outbox/`.
3. Channel adapters flush outbox and send.

Destination:
- Last used channel/user, stored in `.data/last-channel.json`.

## Tools (Plugins)

Configured in `opencode.json`:

- `install_skill` → installs GitHub tree URL skill into `.agents/skills/`
- `save_memory` → append to memory file
- `send_channel_message` → queue proactive message

## Security / Pairing

Whitelist: `.data/whitelist.json`
- `/pair <token>` if `WHITELIST_PAIR_TOKEN` is set
- Otherwise manual edit by admin

## Persistent Data

- `~/.radclaw/workspace/SOUL.md`
- `~/.radclaw/workspace/IDENTITY.md`
- `~/.radclaw/workspace/AGENTS.md`
- `~/.radclaw/workspace/USER.md`
- `~/.radclaw/workspace/TOOLS.md`
- `~/.radclaw/workspace/HEARTBEAT.md`
- `~/.radclaw/workspace/MEMORY.md`
- `~/.radclaw/workspace/memory/YYYY-MM-DD.md`
- `~/.radclaw/sessions.json`
- `~/.radclaw/whitelist.json`
- `~/.radclaw/last-channel.json`
- `~/.radclaw/outbox/`
- `~/.radclaw/whatsapp-auth/`

## Commands

User:
- `/new`
- `/remember <text>`
- `/pair <token>`

Developer:
- `bun run dev`
- `bun run start`
- `bun run typecheck`
- `bun run test:opencode:e2e`

## Tradeoffs

- Message polling is a fallback (not streaming).
- Memory is append-only.
- Whitelist is file-based.
- Heartbeat is checklist-style, not a workflow engine.

## Extension Points

- Add channels under `src/channels/`.
- Add tools via `.agents/plugins/*.plugin.js` and register in `opencode.json`.
- Add skills under `.agents/skills/`.
