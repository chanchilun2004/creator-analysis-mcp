# Creator 數據來源：creator-analysis MCP（唯一數據通道）

所有 creator 數據**只可經 creator-analysis MCP tools 取得**。本 skill 不提供任何直接 API 存取方式。

## ⓪ 硬性規則

1. 先檢查 session 有冇以下 MCP tools（名稱通常以 `mcp__creator-analysis__` 或 `creator-analysis:` 開頭）：
   `creator_research`、`creator_suggest`、`creator_tagged_media`、`creator_contact`、`similar_brands`
2. **有** → 直接用 tool call 攞數據（每個 call 約 2 秒，回傳 JSON）。
3. **冇** → **停止分析**，唔好嘗試任何後備方案：
   - ❌ 禁止用 curl／fetch 直接打任何 API
   - ❌ 禁止用 Claude in Chrome／瀏覽器 fetch 數據
   - ❌ 禁止爬 Instagram
   - ✅ 只做一件事：顯示下面嘅「連接指示」，請用戶設定好 connector 之後再翻嚟

## 連接指示（畀用戶睇）

**claude.ai / Claude Desktop / Cowork**
1. Settings → Connectors → Add custom connector
2. Name 填 `creator-analysis`，Remote MCP server URL 貼：
   `https://creator-analysis-mcp-production.up.railway.app/mcp`
3. Advanced settings 嘅 OAuth Client ID／Secret **留空**（server 支援自動註冊）
4. 按 Add → Connect → 瀏覽器彈出授權頁 → 輸入你獲發嘅 access token → 完成

**Claude Code（CLI）**
```bash
claude mcp add --transport http creator-analysis \
  https://creator-analysis-mcp-production.up.railway.app/mcp \
  --header "Authorization: Bearer <你獲發嘅token>"
```

冇 access token？向管理員索取（token 唔會出現喺本文件）。

## MCP tools 參考

所有回應包喺 envelope：`{"status": 200, "data": {...}}`

### creator_research({ username })
單一 creator 深度研究（主力 tool，一個 call 攞晒核心數據）。回應 data：
- `followed_by_count`, `follow_count`, `full_name`, `category_name`
- `account_stats`: `avg_engagement_rate`（小數，×100 得 %）, `fake_audience_score`（0–100，越低越好）, `risk_level`（MINIMAL/LOW/MEDIUM/HIGH；≥70 HIGH、≥40 MEDIUM、≥20 LOW）, `avg_play_count`
- `creator_research`: `creator_types`, `avg_collab_fee`（HKD）, `avg_rating`, `gender`, `age_range`, `audience_gender`, `audience_age`, `audience_regions`, `behavior_tags`（新帳號可能未有）
- `recent_reels[]`（≤12 即時）: `link`, `like_count`, `comment_count`, `play_count`, `taken_at`, `caption_text`（play_count=0 通常係圖文 carousel）
- `reels_highlight[]`（庫內精選）: `instagram_link`, `play_count`, `like_count`, `engagement_rate`, `video_published_at`
- `follower_growth`（如有）: `current`, `growth_7d/30d/90d{pct}`, `series[]{date,followers}`
- `username_history[]`

### creator_tagged_media({ username })
被 tag 貼文（≤42），用嚟核實品牌合作往績。逐項有 `username`（發文者）, `is_paid_partnership`, `caption_text`, `like_count`, `taken_at`。

### creator_contact({ username })
聯絡方式：`contact_email`, `contact_phone`, `contact_area_code`, `preferred_contact_method`。只在用戶要求聯絡時使用。

### creator_suggest({ q, limit? })
Username 自動完成（handle 唔確定時先用；用戶直接畀咗完整 handle／URL 就可以跳過）。

### creator_avatar({ url? , username? })
將 creator 頭像轉成 base64 data URI（通常 3–10KB）。報告 header 嵌入頭像必用此工具——
對話 widget 的 CSP 會封鎖外部圖片網域，只有 `data:` URI 能顯示。
用法：優先傳 `url`（creator_research 回應中的 `profile_pic_url_hd`，最快）；冇 URL 先傳 `username`。
回傳字串直接放入 `<img src="...">`。此工具失敗時 fallback 用姓名首字圓圈，報告不得因此中斷。

### creator_report_link({ username, analysis })
生成簽名分享連結，server 即時渲染完整 HTML 報告（真頭像、reels 縮圖、增長曲線，無 CSP 限制）。
**分析完成後必 call，作為預設報告輸出**；連結有效 30 日、不含任何憑證。
`analysis` 精簡 JSON（總長 <4KB，每個字串從簡）：
`{sub:"一句定位", verdict:"建議合作", vTone:"success|warning|danger", total:"4.5",
 scores:[{q:"問題",chip:"放心",t:"success|accent|warning|danger",s:5,r:"理由 ≤45字"}]（5 項）,
 fake_note:"假粉結論一句", audience:"受眾總結 ≤90字", collabs:"過往合作 ≤90字",
 risks:[{t:"success|warning|danger",h:"標題",d:"≤30字"}], rec:"建議 ≤90字"}`
回傳 URL 直接以 markdown link 顯示俾用戶。

### similar_brands({ username, limit? })
搵相似品牌（用戶提供品牌 IG 時做受眾匹配校準用）。

## 用法優先次序（固定三步流程）
1. （可選）用戶品牌 IG：作受眾匹配基準，可配合 `similar_brands` 攞品牌背景 →
2. handle 唔確定先用 `creator_suggest` 確認（用戶畀咗明確 handle／URL 可跳過）→
3. `creator_research` 攞核心數據（ER、假粉、reels、受眾）→ 需要核實合作往績先用 `creator_tagged_media` → 輸出報告

MCP 攞唔到嘅（爭議史、內容風格觀感、新帳號未分析）先用 web search 補充。MCP 實測數字優先於人手估算，報告內標明「API 實測」。
