**單一 creator 對話報告請用 references/widget-template.md 的固定模板（只換 D 數據）。本檔用於多人比較、文字 fallback 及 HTML 檔報告的 layout 規格。**

# Report output spec

Primary output = interactive GUI dashboard rendered inline in conversation (HTML widget). Secondary = short text summary in the chat response. Full text format at the bottom is the fallback when no widget tool is available.

## GUI dashboard — single creator

Layout (top to bottom), flat design, CSS variables for theming, works in light/dark mode:

1. **Header card**: circular avatar + creator name + @handle, tier badge (Nano/Micro/Mid/Macro), verdict badge on the right — 建議合作 (green) / 有條件合作 (amber) / 唔建議 (red). One-line positioning summary.
   Avatar: call `creator_avatar({url: profile_pic_url_hd})` (from creator_research) and embed the returned data URI as a 48px round `<img>` — in-conversation widgets CSP-block external image hosts, so a raw https URL will NOT render; only the data URI works. If the tool fails, show an initials circle instead (the report must still look complete without the photo). Example:
   `<img src="{creator_avatar data URI}" style="width:48px;height:48px;border-radius:50%;object-fit:cover" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div style="display:none;width:48px;height:48px;border-radius:50%;align-items:center;justify-content:center">{initials}</div>`
2. **Stat cards row** (3–4 cards): Followers, 平均互動 (likes/comments), ER% vs tier 基準 (show benchmark range underneath), 廣告貼文密度. Mark estimates with 「估算」.
3. **評分 section — plain-language version**: phrase each of the 5 rubric dimensions as a question the client would ask (數據掂唔掂？/ 粉絲係咪你嘅目標客？/ 同品牌合作過未？/ 有冇風險？/ 內容質素高唔高？). Each row = verdict chip (放心 green / 中等 blue / 要留意 amber / 唔掂 red) + score /5 + one-line reason in everyday language. No bare bars without explanation.
3b. **假粉絲分析 section (mandatory)**: horizontal risk scale 0–100 with colored zones (0–20 極低 green, 20–40 低, 40–70 中等 amber, 70+ 高 red) and a marker at the creator's fake_audience_score; show risk_level and a one-line conclusion with evidence (interaction ratios, comment authenticity, growth pattern).
3c. **Top 3 內容 section**: top 3 posts/reels by performance as linked cards — thumbnail, type badge (Reel/圖文 Carousel), title from caption, 觀看/likes/comments, date, and a one-line pattern takeaway (e.g. which format drives reach vs engagement).
   Thumbnails: the API returns `thumbnail_url` per reel. In-conversation widgets are CSP-restricted to allowlisted CDNs and security filters may block base64 extraction — if the thumbnail cannot be embedded, use a flat styled placeholder with the post link instead, and offer the HTML-file report where thumbnails render fully.
4. **受眾匹配 card**: inferred audience profile vs brand target customer, fit notes tied to the stated brand (F&B/Beauty/FMCG lens).
5. **過往品牌合作**: compact list/table — brand, industry, format, observed performance note. Flag 競品衝突 in red.
6. **風險審查**: flag list with severity icons (red/amber/neutral) — fake-follower signals, 爭議史, 飽和度, 內容一致性.
7. **建議 footer**: recommendation + suggested collaboration format (置入貼文/Reels/限時動態/長期 ambassador) + 條件 (if conditional).
8. Footer buttons: sendPrompt() follow-ups 「深入分析」「草擬合作邀請訊息」, plus a fixed link button 「尋找更多網紅」 opening https://moodboard.today. Do NOT include 尋找替代人選/similar-KOL search, 取得聯絡方式 or HTML 檔案版 buttons.

## GUI dashboard — multi-creator comparison

1. **Header**: campaign/brand context + number of candidates.
2. **Comparison table**: one column per creator; rows = Followers, ER% (vs benchmark), 受眾匹配, 過往同類合作, 風險旗數, 加權總分, 結論 badge. Highlight the best value per row.
3. **Ranking strip**: ordered recommendation with one-line rationale per creator.
4. **Per-creator mini cards** (collapsible or stacked): top 2 strengths + top risk each.
5. **Footer**: overall recommendation — who to approach first, and with what format/budget tier.

Keep the widget compact; details the user can ask about go through sendPrompt buttons, not crammed into the dashboard.

## HTML file report (offer when thumbnails/full visuals matter)
Same layout as the GUI dashboard but saved as a standalone .html file in the outputs folder (present via file card). No CSP restriction applies, so embed `thumbnail_url` images directly. Use this when the user wants thumbnails, print/share versions, or a client-ready deliverable.

## Language
All report copy (widget, file, chat summary) in formal written Traditional Chinese (書面語). Do not use Cantonese colloquialisms in report deliverables unless the user requests it.

## Chat text summary (always accompany the widget)
3–5 sentences: verdict, 2–3 key numbers, main risk, next-step suggestion. Then offer follow-ups.

## Fallback: full text report (no widget tool available)

### 單一 creator
```
📋 Creator 分析報告：{name} (@{handle})
評估品牌/campaign：{brand}

一、基本數據
- Followers：{n}（{tier}）
- 平均互動：{likes} likes / {comments} comments
- ER：{er}%（同 tier 基準 {range}）
- 發文頻率／內容組合：{...}

二、受眾分析
{受眾輪廓 + 同品牌目標客群匹配度}

三、過往品牌合作
{品牌、行業、形式、成效觀察；競品衝突警示}

四、風險審查
{紅旗列表，每項一句}

五、評分
基本數據 x/5 · 受眾匹配 x/5 · 過往合作 x/5 · 風險 x/5 · 內容質素 x/5
加權總分：x.x/5

結論：{建議合作/有條件合作/唔建議} — {一句理由}
建議合作形式：{...}
```

### 多人比較
Comparison table (markdown) with the same rows as the GUI version, followed by ranking + rationale.

## Sourcing rules
- Cite source for each key figure (profile page, third-party stats site, news article)
- Label estimates as 估算
- Note data-collection date
