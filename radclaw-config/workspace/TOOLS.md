# TOOLS.md — Rad Business Tool Reference

---

## Sub-Agent Delegation

| Tool | Usage |
|---|---|
| **task** | Spawn blocking sub-agent — waits for result before continuing. Use for: validation research, brief writing, listing copy, analysis. |
| **delegate** | Spawn background sub-agent — non-blocking. Use for: product builds, deep market scans, extended research. Rad stays available. |
| **delegation_read(id)** | Retrieve completed background delegation result. |
| **delegation_list()** | List all delegations with status and summaries. |

---

## Sub-Agent Roles

When spawning, specify the role in the task prompt title:

| Role | When to Spawn |
|---|---|
| **RESEARCHER** | Market scans, competitor analysis, keyword research, demand signals |
| **VALIDATOR** | Idea stress-testing, USP development, buyer persona definition |
| **BRIEFER** | Product briefs, listing copy, title/description/tags, outlines |
| **BUILDER** | Actual product creation (Notion template, PDF, code bundle, etc.) |
| **ANALYST** | Sales data interpretation, conversion analysis, performance review |
| **COPYWRITER** | Sales page copy, email sequences, product descriptions (extended) |

---

## Memory & State

| Tool | Usage |
|---|---|
| **memory.append(note)** | Write a learning or fact to MEMORY.md |
| **memory.readAll()** | Read full memory for context loading |
| **file read/write** | Read/write workspace files (briefs, logs, pipeline) |

---

## Pipeline Management

The pipeline lives at `~/.radclaw/pipeline.json`. Rad reads and updates it directly.

Pipeline operations Rad performs:
- Add new product entry (IDEA status)
- Update product status with timestamp
- Attach scores, briefs, observation reports
- Archive killed products

---

## Platform Integrations (Future)

When connected, Rad will have access to:

| Platform | Capability |
|---|---|
| **Gumroad API** | Sales data, product stats, revenue tracking |
| **Etsy API** | Listing performance, views, conversion data |
| **Web Search** | Real-time market research, competitor analysis |

Until integrations are live, Rachid provides sales data manually and Rad analyzes it.

---

## Skills

Product-format-specific skills are loaded via `skill(<name>)` tool.

| Skill | Covers |
|---|---|
| `notion-template` | Notion template structure, page hierarchy, database schemas |
| `prompt-pack` | Prompt engineering, pack structure, use-case organization |
| `ebook-pdf` | PDF guide structure, outline conventions, formatting standards |
| `code-bundle` | Code snippet organization, README standards, license inclusion |
| `spreadsheet` | Excel/Google Sheets structure, formula documentation |
| `etsy-listing` | Etsy SEO, tag optimization, photo requirements |
| `gumroad-listing` | Gumroad page structure, pricing psychology, upsell setup |

Sub-agents call `skill(<name>)` natively — Rad does not copy skill content into prompts.

---

## Communication

| Channel | Use |
|---|---|
| **Telegram** | Proactive updates, daily briefings, quick decisions, urgent flags |
| **Web UI** | Strategy sessions, deep analysis, pipeline review, onboarding |

Telegram messages: max 1 screen. Dense. Actionable.
Web UI messages: richer markdown, structured reports, full analysis.
