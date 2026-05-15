# HEARTBEAT.md — Rad Autonomous Task Schedule

Rad reads this file every heartbeat cycle and executes all active tasks in order.
Tasks marked ACTIVE run every cycle. Tasks marked CONDITIONAL run only when their trigger is met.

---

## CYCLE PREAMBLE (every cycle)

Before running any tasks, Rad does:
1. Read MEMORY.md — load strategic context
2. Read pipeline.json — load current product statuses
3. Read GOALS.md — remember what we're optimizing for
4. Note current timestamp and time since last cycle

---

## TASK 001 — PIPELINE HEALTH CHECK
**Status:** ACTIVE
**Trigger:** Every heartbeat cycle
**Mission:** Ensure no product is stuck, stalled, or forgotten

Rad checks every product in pipeline.json:
- Any product in BUILDING for more than 14 days? → Flag and notify Rachid
- Any product in READY for more than 7 days? → Ask Rachid for launch decision
- Any product LIVE for more than 30 days with no OBS entry? → Trigger observation
- Any product in IDEA for more than 21 days with no scoring? → Score or kill
- Any product in OPTIMIZING for more than 30 days with no change? → Escalate

Write findings to daily log. Notify Rachid if any flag is triggered.

---

## TASK 002 — MARKET INTELLIGENCE CYCLE
**Status:** ACTIVE
**Trigger:** Every heartbeat cycle
**Mission:** Run full Stage 1 intelligence pipeline — multi-source research, parallel analysis, scored opportunities

Rad spawns @market-intel-orchestrator (blocking task) which internally:

1. **Fires 4 research delegates in parallel:**
   - @market-trends — trending products, formats, search velocity
   - @market-competitor — top sellers, pricing, gaps, whitespace
   - @market-pain-points — customer frustrations from reviews, forums, social
   - @market-opportunities — scored product ideas (0-12 matrix)

2. **Collects all results** via delegation_read

3. **Synthesizes** into `.data/market-intel/{YYYY-MM-DD}-report.md`

4. **Promotes** any opportunity scoring ≥8/12 to pipeline.json as IDEA status

Rad reads the orchestrator's result and:
- Writes key findings to daily log `memory/YYYY-MM-DD.md`
- Notifies Rachid only if a high-scoring opportunity (≥8) is found
- Flags if all streams returned thin data (signal drought signal)

---

## TASK 003 — OBSERVATION TRIGGERS
**Status:** CONDITIONAL
**Trigger:** Any LIVE product reaching 30, 60, or 90 days since launch

For each triggered product:
1. Spawn ANALYST sub-agent with product brief and any available sales data
2. Generate observation report at `products/{slug}/OBS-{date}.md`
3. Classify as 🟢 On Track / 🟡 Underperforming / 🔴 Critical
4. Generate REPLAN recommendation
5. Notify Rachid with summary and recommendation

---

## TASK 004 — DAILY BUSINESS BRIEFING
**Status:** CONDITIONAL
**Trigger:** First heartbeat cycle after 08:00 in Rachid's timezone
**Mission:** Start Rachid's day with a crisp, actionable briefing

Rad sends one Telegram message containing:
```
🐾 Rad — Daily Briefing [{DATE}]

📊 PIPELINE:
  • [STATUS COUNT SUMMARY — e.g. "2 LIVE, 1 BUILDING, 3 IDEAS"]

💰 REVENUE (last 7 days):
  • [Total if data available, otherwise: "Awaiting your Gumroad/Etsy update"]

🔥 TOP PRIORITY TODAY:
  • [The ONE thing that most advances the mission today]

📌 YOUR ACTION NEEDED:
  • [Specific decision or input Rad needs from Rachid, if any]
```

Keep it tight. No fluff. This should take Rachid under 30 seconds to read.

---

## TASK 005 — MEMORY DISTILLATION
**Status:** CONDITIONAL
**Trigger:** When daily log files exceed 5 entries OR weekly (whichever comes first)
**Mission:** Keep MEMORY.md strategic and current, not bloated

Rad reads all recent daily logs and:
- Extracts learnings that should persist long-term
- Distills into concise, tagged entries in MEMORY.md
- Archives daily logs (does not delete — moves to `memory/archive/`)
- Updates MEMORY.md with distilled entries

---

## TASK 006 — IDEA SCORING QUEUE
**Status:** CONDITIONAL
**Trigger:** When pipeline.json contains IDEAS with no score attached
**Mission:** Keep pipeline decisions data-driven, never emotional

For each unscored IDEA:
1. Spawn VALIDATOR to research and score on 4 dimensions (demand, speed, margin, differentiation)
2. Attach score and evidence to pipeline entry
3. Sort IDEA list by score
4. If top IDEA scores ≥8, notify Rachid: "We have a validated idea ready to brief."

---

## TASK 007 — STALE PIPELINE NUDGE
**Status:** CONDITIONAL
**Trigger:** Pipeline has no product in BUILDING or READY for more than 7 days
**Mission:** Keep the factory running — empty pipeline = no revenue growth

Rad sends Rachid one message:
```
🐾 Rad here.

Our pipeline has been idle for X days. No product in BUILDING or READY.

Top validated ideas ready to brief:
  1. [IDEA NAME] — Score: X/12
  2. [IDEA NAME] — Score: X/12

Want me to write the brief for #1 and get it into BUILD? 
Just say yes and I'll handle it.
```

---

## TASK 008 — WEEKLY STRATEGY SUMMARY
**Status:** CONDITIONAL
**Trigger:** Every Sunday (first heartbeat cycle after midnight)
**Mission:** Give Rachid a weekly business snapshot for planning

Rad generates and sends:
```
🐾 Rad — Weekly Summary [Week of {DATE}]

📦 PRODUCTS:
  • Live: X products
  • In progress: X products
  • Ideas validated: X

💰 REVENUE THIS WEEK:
  • [Total or "pending data"]

🏆 WIN OF THE WEEK:
  • [Best thing that happened]

⚠️ PROBLEM OF THE WEEK:
  • [Biggest issue or risk]

🎯 NEXT WEEK PRIORITY:
  • [One clear focus]

Full pipeline: [link to web UI]
```

---

## ADDING TASKS

To add a new heartbeat task, append to this file with the format above.
Rad reads all ACTIVE and triggered CONDITIONAL tasks every cycle.
Tasks are executed in order (001 first, highest number last).
