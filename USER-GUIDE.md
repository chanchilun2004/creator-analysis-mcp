# creator-analysis 使用指南

喺 Claude 入面直接分析 Instagram KOL：互動率、假粉風險、受眾輪廓、合作費參考，一句指令出完整評估報告。

---

## 1. 你需要

- 一個 Claude 帳戶（claude.ai、Claude Desktop 或 Claude Code 均可）
- 一條 **access token**（由管理員發出，等同密碼，請妥善保管）

## 2. 連接（一次性設定，二選一）

### 方法 A：claude.ai / Claude Desktop（推薦）

1. 開 **Settings → Connectors → Add custom connector**
2. 填寫：
   - **Name**：`creator-analysis`
   - **Remote MCP server URL**：`https://creator-analysis-mcp-production.up.railway.app/mcp`
   - Advanced settings 的 OAuth Client ID / Secret **留空**
3. 按 **Add**，然後按 **Connect**
4. 瀏覽器會彈出授權頁 → 輸入你的 access token → 完成

> 授權有效 30 日，到期後重按 Connect 再輸入一次即可。

### 方法 B：Claude Code（CLI）

```bash
claude mcp add --transport http creator-analysis \
  https://creator-analysis-mcp-production.up.railway.app/mcp \
  --header "Authorization: Bearer <你的token>"
```

## 3. 開始使用

連接好之後，直接用自然語言就得。例句：

| 你想做 | 咁樣講 |
|--------|--------|
| 分析單一 KOL | 「幫我分析 https://www.instagram.com/eat.food.and.chill/ 適唔適合合作」 |
| 多人比較 | 「比較 @kol_a、@kol_b、@kol_c，邊個最適合我哋甜品店？」 |
| 配合自己品牌 | 「我品牌係 @mybrand_hk，分析 @kol_a 嘅受眾匹配度」 |
| 深入分析 | 「就 @kol_a 做深入分析：內容主題分佈、最佳發文時段」 |
| 草擬邀請 | 「幫我草擬一封俾 @kol_a 嘅合作邀請訊息」 |

報告內容包括：互動率（對比同級基準）、假粉評分與風險等級、受眾性別／年齡／地區、粉絲增長趨勢、表現最佳內容、過往品牌合作、風險審查、評分結論與合作形式建議。

## 4. 使用貼士

- **一個 KOL 報告約需 1 分鐘**；期間會顯示進度條
- 每條 token 有 **每分鐘 30 次請求**上限，正常使用唔會觸及
- 數據來自 Creator Recommendation API 實測（非估算），報告內會標明數據更新日期
- 未入庫嘅新帳號可能冇假粉／受眾數據，報告會註明並以公開資料補充

## 5. 常見問題

**Q：撳 Connect 之後話 token 無效？**
檢查有冇多咗空格；token 區分大小寫。仍然唔得就搵管理員確認 token 狀態。

**Q：出現 401 Unauthorized？**
OAuth 授權過咗 30 日，或者你嘅 token 已被撤銷。重新 Connect 一次；唔得就搵管理員。

**Q：出現 429 Rate limit exceeded？**
一分鐘內請求太密。等一分鐘再試。

**Q：Connector 接咗但 Claude 話搵唔到工具？**
開一個新對話再試；Desktop 用戶可以重啟 app。

**Q：token 唔見咗／懷疑洩漏？**
即刻通知管理員撤銷並補發新 token。

## 6. 安全守則

- Token 等同密碼：**唔好**貼上群組、共用文件、截圖
- 每人一條 token，唔好互相借用（撤銷時會影響埋你）
- 收到嚟歷不明嘅「授權頁」連結唔好輸入 token——授權頁只會喺你自己撳 Connect 時彈出，網址一定係 `creator-analysis-mcp-production.up.railway.app`

---

*管理員：token 管理喺 Railway 專案 `creator-analysis-mcp` 嘅 `MCP_ACCESS_TOKENS` 變數；技術細節見 [README.md](README.md)。*
