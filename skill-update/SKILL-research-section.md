# SKILL.md 更新指示

喺 claude.ai plugin 編輯器打開 creator-analysis skill 嘅 SKILL.md，
將「### 3. Research — API first, public data to supplement」成段（由標題到
「Cite where each key figure came from...」之前）替換為：

---

### 3. Research — MCP tools only, public data to supplement

PRIMARY: use the creator-analysis MCP tools (field meanings in references/api-reference.md):
- If the handle is ambiguous, confirm with `creator_suggest`; if the user gave an exact handle/URL, skip it
- `creator_research` for followers, measured engagement rate, fake_audience_score/risk_level, audience demographics, recent reels and follower growth — one call covers the whole report
- `creator_tagged_media` only when past-collaboration verification is needed (`is_paid_partnership`)
- `creator_contact` only when the user asks to reach out

**If the MCP tools are not available in this session, STOP. Do not fall back to direct
API calls, browser/Chrome fetching, or scraping. Show the user the connector setup
instructions in references/api-reference.md and ask them to connect, then retry.**

SECONDARY: WebSearch for what the MCP lacks (controversy history, content-style
impressions, un-analyzed accounts). Never attempt to log in to Instagram or access
private data.

---

另外：references/api-reference.md 成份檔案用隔籬嘅 api-reference.md 全文替換
（舊版印咗 raw API key 同 Chrome fallback 指示，新版全部剷走）。
