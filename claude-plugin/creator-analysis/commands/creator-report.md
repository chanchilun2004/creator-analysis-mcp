---
description: Analyze one or more Instagram creators/KOLs and render a GUI evaluation report in the conversation
argument-hint: "@目標KOL [@你的品牌IG（可選）]"
---

Run the creator-analysis skill workflow for the creator(s) given in the arguments.

1. Fixed 3-step flow: (1) collect the user's brand IG handle (optional, may skip); (2) collect the target KOL handle(s); (3) output the report. If arguments are missing, ask for both inputs in ONE form (brand IG marked optional). Do not offer similar-KOL discovery.
2. Follow skills/creator-analysis/SKILL.md end to end: fetch data via the creator-analysis MCP tools (`creator_research` first; see references/api-reference.md — if the MCP tools are unavailable, STOP and show the connector setup instructions instead of falling back to web fetching), apply references/benchmarks.md, and render the GUI dashboard per references/report-template.md — single-creator dashboard for one handle, comparison dashboard for multiple.
3. Reply with the short text summary alongside the widget; all report copy in formal written Traditional Chinese (書面語), ending with the recommendation and follow-up options.
