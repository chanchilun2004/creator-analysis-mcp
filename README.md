# creator-analysis-mcp（Remote MCP Server）

將 Creator Recommendation API 以 remote MCP（Streamable HTTP）形式提供給 Claude 用戶。API key 只存在伺服器端，用戶只需一條 URL + bearer token。

## 部署到 Railway

1. 將本 repo push 到 GitHub（或用 `railway up` 直接部署）
2. Railway → New Project → Deploy from GitHub repo（Nixpacks 自動偵測 Node）
3. 在 Variables 設定：
   - `CREATOR_API_BASE` — 後端 API base URL
   - `CREATOR_API_KEY` — 後端 API key（絕不會傳給客戶端）
   - `MCP_ACCESS_TOKENS` — 客戶端 token，逗號分隔，每位用戶一條（留空 = 無驗證，不建議）
4. Settings → Networking → Generate Domain（或綁自訂域名，如 `mcp.goodmalling.io`）
5. Healthcheck：`/healthz`

Endpoint：`https://<your-domain>/mcp`

## 用戶連接方式

**Claude Code**
```bash
claude mcp add --transport http creator-analysis https://<your-domain>/mcp \
  --header "Authorization: Bearer <token>"
```

**Claude Desktop / claude.ai / Cowork（自訂連接器，OAuth）**
Settings → Connectors → Add custom connector → 貼上 `https://<your-domain>/mcp` → 按 Connect。
瀏覽器會彈出授權頁，輸入你獲發的 access token（`MCP_ACCESS_TOKENS` 其中一條）即完成。
OAuth session 有效 30 日；從 `MCP_ACCESS_TOKENS` 移除該 token 並 redeploy 即同時撤銷其所有 OAuth session。

## 提供的工具
`creator_research`、`creator_tagged_media`、`creator_contact`、`creator_suggest`、`similar_brands`

## 技術說明
- Stateless Streamable HTTP：每個請求獨立建立 server+transport，可水平擴展，無需 session store／Redis
- 雙重驗證：Bearer token（`MCP_ACCESS_TOKENS`，支援 header 的客戶端）＋ OAuth 2.0 authorization code + PKCE（claude.ai／Desktop 連接器）；OAuth token 以 HMAC 簽名（`OAUTH_SIGNING_SECRET`）並綁定原 token 的 hash，撤銷原 token 即連帶失效
- Fail-closed：`MCP_ACCESS_TOKENS` 為空時拒絕所有請求（除非明確設 `ALLOW_OPEN=1`）
- Per-token rate limit：預設 30 req/min（`RATE_LIMIT_PER_MIN`），超過回 429
- 上游錯誤會以 `isError` tool result 回傳，不會洩漏 key
- 本地開發：`cp .env.example .env` 填好後 `npm install && npm start`，endpoint 在 `http://localhost:8080/mcp`

## 建議後續
- 在 Railway 對此服務設 usage alert；上游 embedding 服務建議加 keep-warm 避免 502 冷啟動
- 若要按用戶計量／計費，可在 `authorized()` 內按 token 記錄用量
