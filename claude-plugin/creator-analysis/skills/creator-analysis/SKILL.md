---
name: creator-analysis
description: Research an Instagram creator/KOL from public data and produce a text-based collaboration-evaluation report in chat, covering core metrics, audience fit, past brand collaborations, risk review and a scored recommendation. Supports comparing multiple creators side by side. Use whenever the user asks to analyze a creator or KOL, evaluate an influencer for a campaign, or compare candidates — e.g. "分析呢個 creator", "評估呢個 KOL 值唔值得合作", "compare these influencers", "creator report", "KOL 分析報告", "幫我睇下 @handle", or names/handles of Instagram creators with an enquiry about collaboration.
---

# Creator analysis (Instagram KOL 合作評估)

Produce a professional analysis report in chat to help decide whether to collaborate with an Instagram creator. Report copy must be written in formal written Traditional Chinese (書面語, not Cantonese colloquial), unless the user asks otherwise.

## Workflow — fixed 3-step flow

### Step 1. Collect the user's brand IG (optional)
- Ask for the user's brand Instagram handle (optional — user may skip). Collect via an input form/AskUserQuestion together with Step 2 in ONE prompt, not two rounds.
- If provided: look up the brand's IG profile (positioning, product type, tone, follower profile) and use it as the reference point for the 受眾匹配 dimension. Optionally call `GET /v1/api/similar-brands` for brand context.
- If skipped: use the default industry lens (F&B, Beauty, FMCG) for audience-fit judgments.

### Step 2. Collect the target KOL
- Confirm the exact Instagram handle of the creator to analyze. If the user gave an exact handle or profile URL, use it directly; only verify with `creator_suggest` when the handle is ambiguous. If the user gives a vague description, identify via web search and confirm.
- If the user supplies multiple handles themselves, run the workflow per creator and produce the comparison output. Do NOT proactively search for or suggest similar/alternative KOLs — no candidate-discovery step.

### Step 3. Output
- Research (see below), analyze, and render the report. This is the only deliverable step.

### 3. Research — MCP tools only, public data to supplement
PRIMARY: use the creator-analysis MCP tools (field meanings in references/api-reference.md):
- If the handle is ambiguous, confirm with `creator_suggest`; if the user gave an exact handle/URL, skip it
- `creator_research` for followers, measured engagement rate, fake_audience_score/risk_level, audience demographics, recent reels and follower growth — one call covers the whole report
- `creator_tagged_media` only when past-collaboration verification is needed (`is_paid_partnership`)
- `creator_contact` only when the user asks to reach out

**If the MCP tools are not available in this session, STOP. Do not fall back to direct API calls, browser/Chrome fetching, or scraping. Show the user the connector setup instructions in references/api-reference.md and ask them to connect, then retry.**

SECONDARY: WebSearch for what the MCP lacks (controversy history, content-style impressions, un-analyzed accounts). Never attempt to log in to Instagram or access private data.

Gather per creator:
- Profile basics: follower count, bio/positioning, posting frequency, content mix (Reels vs 貼文 vs Stories highlights)
- Engagement signals: API-measured avg_engagement_rate; typical likes/comments on recent reels
- Past brand collaborations: infer from reel captions (brand tags, campaign hashtags); use creator_tagged_media only when verification matters
- Press/news/forum mentions (LIHKG, 小紅書, Threads) for reputation and controversy history

Cite where each key figure came from. Flag figures that are estimates.

### 4. Analyze
Apply the benchmarks and rubric in references/benchmarks.md:
- Prefer API-measured figures (avg_engagement_rate, fake_audience_score) over manual estimates; label them API 實測
- Tier the creator (nano/micro/mid/macro) and compare ER against tier benchmarks
- Audience fit vs the brand's target customer (demographics inferred from content language, topics, comment profile)
- Risk review: fake-follower red flags, controversy history, over-saturation with competing brands, content consistency
- Score each dimension 1–5 and compute the weighted total

### 5. Output — GUI report in conversation
- Primary output is an interactive GUI dashboard rendered inline in the conversation using the available visualization/widget tool (e.g. show_widget with an HTML dashboard). Follow the layout spec in references/report-template.md: header card with creator identity + verdict badge, metric stat cards, score bars per dimension, past-collaboration list, risk flags, and for multi-creator mode a side-by-side comparison table with a ranked recommendation.
- Accompany the widget with a short text summary in the chat response (3–5 sentences: verdict, key numbers, main risk). If no visualization tool is available in the session, fall back to the full text report format in references/report-template.md.
- End with a clear recommendation: 建議合作 / 有條件合作 / 唔建議, plus suggested collaboration format (置入貼文、Reels、限時動態、長期 ambassador 等)
- Offer follow-ups: deeper dive on one creator, add candidates to the comparison, or draft an outreach message

## Rules
- Public data only; no scraping behind login, no private-data claims.
- Distinguish facts (sourced) from estimates (labelled 估算).
- Numbers change fast — always research fresh; never answer from memory.
- Keep the report scannable: short sections, tables for numbers, one-line verdicts.
