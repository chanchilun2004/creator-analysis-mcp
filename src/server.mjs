import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const BASE = process.env.CREATOR_API_BASE;
const KEY = process.env.CREATOR_API_KEY;
const TOKENS = (process.env.MCP_ACCESS_TOKENS || '').split(',').map(s => s.trim()).filter(Boolean);
const PORT = Number(process.env.PORT || 8080);
const ALLOW_OPEN = process.env.ALLOW_OPEN === '1';
const RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN || 30);

if (!BASE || !KEY) {
  console.error('FATAL: CREATOR_API_BASE / CREATOR_API_KEY must be set');
  process.exit(1);
}
if (TOKENS.length === 0) {
  if (ALLOW_OPEN) console.warn('WARN: MCP_ACCESS_TOKENS empty and ALLOW_OPEN=1 — endpoint is UNAUTHENTICATED');
  else console.warn('WARN: MCP_ACCESS_TOKENS empty — endpoint will REJECT all requests (set ALLOW_OPEN=1 to run open intentionally)');
}

async function callApi(path, params) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]))
  );
  const res = await fetch(`${BASE}${path}?${qs}`, { headers: { 'X-API-Key': KEY } });
  const text = await res.text();
  if (!res.ok) throw new Error(`upstream ${res.status}: ${text.slice(0, 300)}`);
  return text;
}

const clean = u => String(u).replace(/^@/, '').trim();
const wrap = fn => async args => {
  try {
    return { content: [{ type: 'text', text: await fn(args) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: String(e.message || e) }], isError: true };
  }
};

function buildServer() {
  const server = new McpServer({ name: 'creator-analysis', version: '1.0.0' });
  server.registerTool('creator_research', {
    description: 'Research an Instagram creator/KOL profile: followers, measured avg engagement rate, fake_audience_score (0-100, lower is better) with risk_level, audience demographics, collab fee, recent reels and follower growth. Primary tool for KOL collaboration evaluation.',
    inputSchema: { username: z.string().describe('Instagram handle, with or without @') }
  }, wrap(a => callApi('/v1/api/creator-research', { username: clean(a.username) })));

  server.registerTool('creator_tagged_media', {
    description: 'Get posts in which a creator is tagged (max 42). Use to verify past brand collaborations - check is_paid_partnership and who tagged them.',
    inputSchema: { username: z.string().describe('Instagram handle') }
  }, wrap(a => callApi('/v1/api/creator-tagged-media', { username: clean(a.username) })));

  server.registerTool('creator_contact', {
    description: 'Get a creator contact info: contact_email, contact_phone, preferred_contact_method. Only call when the user wants to reach out.',
    inputSchema: { username: z.string().describe('Instagram handle') }
  }, wrap(a => callApi('/v1/api/creator-contact', { username: clean(a.username) })));

  server.registerTool('creator_suggest', {
    description: 'Autocomplete Instagram creator usernames (creators with research data, ordered by followers). Use to confirm an exact handle before research.',
    inputSchema: { q: z.string().min(2).describe('Username prefix, min 2 chars'), limit: z.number().optional().describe('Max results, default 10, cap 20') }
  }, wrap(a => callApi('/v1/api/creator-suggest', { q: a.q, limit: a.limit })));

  server.registerTool('similar_brands', {
    description: 'Find brands similar to a given brand IG handle (embedding similarity). Use for optional brand-context grounding when the user provides their brand IG.',
    inputSchema: { username: z.string().describe('Brand handle or name'), limit: z.number().optional().describe('Default 10, cap 50') }
  }, wrap(a => callApi('/v1/api/similar-brands', { username: clean(a.username), limit: a.limit })));

  return server;
}

const app = express();
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/healthz', (_req, res) => res.json({ ok: true }));

// ---- OAuth 2.0 (authorization code + PKCE) for clients without custom-header support ----
// A user proves possession of one of MCP_ACCESS_TOKENS on the /authorize page; we then issue
// an HMAC-signed access token bound to that token's hash. Revoking the underlying token
// (removing it from MCP_ACCESS_TOKENS) also kills every OAuth session derived from it.
const SIGNING_SECRET = process.env.OAUTH_SIGNING_SECRET
  || crypto.createHash('sha256').update(`oauth-sign:${KEY}`).digest('hex');
const ACCESS_TOKEN_TTL_S = 30 * 24 * 3600;
const sha256url = s => crypto.createHash('sha256').update(s).digest('base64url');
const hmacUrl = s => crypto.createHmac('sha256', SIGNING_SECRET).update(s).digest('base64url');
const TOKEN_HASHES = new Set(TOKENS.map(sha256url));

function issueAccessToken(userToken) {
  const payload = Buffer.from(JSON.stringify({
    sub: sha256url(userToken),
    exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_S,
  })).toString('base64url');
  return `mat_${payload}.${hmacUrl(payload)}`;
}
function verifyAccessToken(tok) {
  if (!tok.startsWith('mat_')) return false;
  const [payload, sig] = tok.slice(4).split('.');
  if (!payload || !sig) return false;
  const expect = Buffer.from(hmacUrl(payload));
  const given = Buffer.from(sig);
  if (given.length !== expect.length || !crypto.timingSafeEqual(given, expect)) return false;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return exp > Date.now() / 1000 && TOKEN_HASHES.has(sub);
  } catch { return false; }
}

const baseUrl = req => `https://${req.headers.host}`;
const authCodes = new Map();

app.get(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'], (req, res) => {
  const b = baseUrl(req);
  res.json({ resource: `${b}/mcp`, authorization_servers: [b], bearer_methods_supported: ['header'] });
});

app.get(['/.well-known/oauth-authorization-server', '/.well-known/oauth-authorization-server/mcp'], (req, res) => {
  const b = baseUrl(req);
  res.json({
    issuer: b,
    authorization_endpoint: `${b}/authorize`,
    token_endpoint: `${b}/token`,
    registration_endpoint: `${b}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp'],
  });
});

// Dynamic client registration (RFC 7591). Public clients only; PKCE carries the security,
// so we don't persist registrations.
app.post('/register', (req, res) => {
  const { redirect_uris = [] } = req.body || {};
  res.status(201).json({
    client_id: `pub-${crypto.randomBytes(8).toString('base64url')}`,
    token_endpoint_auth_method: 'none',
    redirect_uris,
    grant_types: ['authorization_code'],
    response_types: ['code'],
  });
});

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

app.get('/authorize', (req, res) => {
  const { redirect_uri, state = '', code_challenge, code_challenge_method } = req.query;
  let uri;
  try { uri = new URL(String(redirect_uri)); } catch { return res.status(400).send('invalid redirect_uri'); }
  if (uri.protocol !== 'https:' || !code_challenge || code_challenge_method !== 'S256') {
    return res.status(400).send('invalid request');
  }
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>creator-analysis — 授權</title>
<style>body{font-family:system-ui,sans-serif;background:#f5f5f4;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;border:1px solid #e5e5e3;border-radius:12px;padding:32px;max-width:400px;width:90%}
h1{font-size:18px;margin:0 0 8px}p{font-size:14px;color:#666;line-height:1.6;margin:0 0 20px}
input{width:100%;box-sizing:border-box;padding:10px 12px;font-size:14px;border:1px solid #d4d4d2;border-radius:8px;margin-bottom:16px}
button{width:100%;padding:10px;font-size:14px;font-weight:500;background:#1a1a19;color:#fff;border:none;border-radius:8px;cursor:pointer}
button:hover{background:#333}</style></head><body><div class="card">
<h1>連接 creator-analysis MCP</h1>
<p>請輸入你獲發的 access token 以授權此客戶端。</p>
<form method="POST" action="/authorize">
<input type="password" name="token" placeholder="你的 access token" autofocus required>
<input type="hidden" name="redirect_uri" value="${escapeHtml(redirect_uri)}">
<input type="hidden" name="state" value="${escapeHtml(state)}">
<input type="hidden" name="code_challenge" value="${escapeHtml(code_challenge)}">
<button type="submit">授權</button>
</form></div></body></html>`);
});

app.post('/authorize', express.urlencoded({ extended: false }), (req, res) => {
  const { token, redirect_uri, state = '', code_challenge } = req.body || {};
  const t = String(token || '').trim();
  if (!TOKENS.includes(t)) {
    return res.status(401).type('html').send('<p style="font-family:system-ui;padding:2rem">Token 無效。<a href="javascript:history.back()">返回重試</a></p>');
  }
  let uri;
  try { uri = new URL(String(redirect_uri)); } catch { return res.status(400).send('invalid redirect_uri'); }
  if (uri.protocol !== 'https:') return res.status(400).send('invalid redirect_uri');
  const code = `ac_${crypto.randomBytes(24).toString('base64url')}`;
  authCodes.set(code, { challenge: String(code_challenge || ''), redirect_uri: String(redirect_uri), userToken: t, exp: Date.now() + 5 * 60_000 });
  uri.searchParams.set('code', code);
  if (state) uri.searchParams.set('state', state);
  res.redirect(uri.toString());
});

app.post('/token', express.urlencoded({ extended: false }), (req, res) => {
  const { grant_type, code, code_verifier, redirect_uri } = req.body || {};
  if (grant_type !== 'authorization_code') return res.status(400).json({ error: 'unsupported_grant_type' });
  const rec = authCodes.get(String(code));
  authCodes.delete(String(code));
  if (!rec || rec.exp < Date.now() || rec.redirect_uri !== String(redirect_uri)) {
    return res.status(400).json({ error: 'invalid_grant' });
  }
  if (sha256url(String(code_verifier || '')) !== rec.challenge) return res.status(400).json({ error: 'invalid_grant' });
  res.json({ access_token: issueAccessToken(rec.userToken), token_type: 'Bearer', expires_in: ACCESS_TOKEN_TTL_S, scope: 'mcp' });
});

// Fail-closed: with no tokens set, reject everything unless ALLOW_OPEN=1 is explicit.
// Accepts either a raw token from MCP_ACCESS_TOKENS (header-capable clients) or an
// OAuth-issued signed token (claude.ai / Desktop connectors).
function authorized(req) {
  if (TOKENS.length === 0) return ALLOW_OPEN;
  const h = req.headers.authorization || '';
  const bearer = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  return TOKENS.includes(bearer) || verifyAccessToken(bearer);
}

const bearerOf = req => {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
};

// Per-token fixed-window rate limiter (in-memory, per instance — a basic abuse/cost guard,
// not a distributed quota). Caps upstream spend if a token leaks.
const rlBuckets = new Map();
function rateLimited(key) {
  const now = Date.now();
  let b = rlBuckets.get(key);
  if (!b || now >= b.resetAt) { b = { count: 0, resetAt: now + 60_000 }; rlBuckets.set(key, b); }
  b.count += 1;
  return b.count > RATE_LIMIT_PER_MIN;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of rlBuckets) if (now >= b.resetAt) rlBuckets.delete(k);
  for (const [c, rec] of authCodes) if (now >= rec.exp) authCodes.delete(c);
}, 300_000).unref();

app.post('/mcp', async (req, res) => {
  if (!authorized(req)) {
    return res.status(401)
      .set('WWW-Authenticate', `Bearer resource_metadata="${baseUrl(req)}/.well-known/oauth-protected-resource"`)
      .json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null });
  }
  if (rateLimited(bearerOf(req) || req.ip || 'anon')) {
    return res.status(429).json({ jsonrpc: '2.0', error: { code: -32029, message: 'Rate limit exceeded' }, id: null });
  }
  // Stateless mode: fresh server + transport per request (scales horizontally, no session store)
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
  }
});

// Stateless: no server-initiated streams / no sessions to terminate
app.get('/mcp', (_req, res) => res.status(405).set('Allow', 'POST').send('Method Not Allowed'));
app.delete('/mcp', (_req, res) => res.status(405).set('Allow', 'POST').send('Method Not Allowed'));

app.listen(PORT, () => console.log(`creator-analysis MCP listening on :${PORT}/mcp`));
