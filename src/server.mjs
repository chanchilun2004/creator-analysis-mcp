import crypto from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import express from 'express';
import jpeg from 'jpeg-js';
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

function downscaleJpeg(buf, target = 64) {
  const img = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 32 });
  const { width: w, height: h, data } = img;
  const s = Math.max(1, Math.min(w, h) / target);
  const ow = Math.max(1, Math.round(w / s)), oh = Math.max(1, Math.round(h / s));
  const out = Buffer.alloc(ow * oh * 4);
  for (let y = 0; y < oh; y++) {
    const y0 = Math.floor(y * s), y1 = Math.min(h, Math.max(y0 + 1, Math.ceil((y + 1) * s)));
    for (let x = 0; x < ow; x++) {
      const x0 = Math.floor(x * s), x1 = Math.min(w, Math.max(x0 + 1, Math.ceil((x + 1) * s)));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = (yy * w + xx) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
      const o = (y * ow + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return jpeg.encode({ data: out, width: ow, height: oh }, 70).data;
}

// Avatar → data URI, for CSP-restricted widget surfaces that block external image hosts.
const AVATAR_HOSTS = /(^|\.)goodmalling\.io$|(^|\.)cdninstagram\.com$/;
const avatarCache = new Map();
async function fetchAvatarDataUri({ username, url }) {
  let target = url && String(url).trim();
  const cacheKey = target || `u:${clean(username || '')}`;
  const hit = avatarCache.get(cacheKey);
  if (hit && hit.exp > Date.now()) return hit.uri;
  if (!target) {
    if (!username) throw new Error('provide username or url');
    const text = await callApi('/v1/api/creator-research', { username: clean(username) });
    target = JSON.parse(text)?.data?.profile_pic_url_hd;
    if (!target) throw new Error('no profile picture available for this creator');
  }
  const host = new URL(target).hostname;
  if (!AVATAR_HOSTS.test(host)) throw new Error('avatar host not allowed');
  const res = await fetch(target);
  if (!res.ok) throw new Error(`avatar fetch failed: ${res.status}`);
  let buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 300_000) throw new Error('avatar too large to embed');
  let type = res.headers.get('content-type') || 'image/jpeg';
  // Downscale to 64px so the data URI stays ~1-2KB — the widget-generating model has to
  // copy every base64 char, so bytes here are directly proportional to report latency.
  if (type.includes('jpeg') && buf.length > 2500) {
    try { buf = downscaleJpeg(buf); type = 'image/jpeg'; } catch { /* keep original */ }
  }
  const uri = `data:${type};base64,${buf.toString('base64')}`;
  avatarCache.set(cacheKey, { uri, exp: Date.now() + 6 * 3600_000 });
  if (avatarCache.size > 500) { const k = avatarCache.keys().next().value; avatarCache.delete(k); }
  return uri;
}
const wrap = fn => async args => {
  try {
    return { content: [{ type: 'text', text: await fn(args) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: String(e.message || e) }], isError: true };
  }
};

function buildServer(publicBase) {
  const server = new McpServer({ name: 'creator-analysis', version: '1.0.0' });

  server.registerTool('creator_report_link', {
    description: 'Generate a signed shareable URL to a full server-rendered HTML report (real avatar, reel thumbnails, growth chart — no CSP limits, renders instantly). Call AFTER finishing your analysis, passing a compact analysis object; then present the returned URL to the user as the primary report. Link valid 30 days, no credentials embedded.',
    inputSchema: {
      username: z.string().describe('Instagram handle'),
      analysis: z.record(z.any()).describe('Compact analysis JSON: {sub, verdict, vTone: success|warning|danger, total, scores:[{q,chip,t,s,r}] (5 items, t: success|accent|warning|danger), fake_note, audience, collabs, risks:[{t,h,d}], rec}. Keep every string short; total JSON must stay under 4KB.')
    }
  }, wrap(async a => {
    const json = JSON.stringify({ u: clean(a.username), a: a.analysis || {} });
    if (json.length > 4500) throw new Error('analysis too large — shorten the strings');
    const d = deflateRawSync(Buffer.from(json)).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
    return `${publicBase}/report?d=${d}&exp=${exp}&sig=${hmacUrl(`${d}|${exp}`)}`;
  }));
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

  server.registerTool('creator_avatar', {
    description: 'Get a creator profile picture as a base64 data URI (small JPEG, usually 3-10KB) for embedding in CSP-restricted report widgets where external image URLs are blocked. Pass the profile_pic_url_hd from a prior creator_research call as `url` (fastest), or just the `username`. Embed the returned string directly as an <img src>.',
    inputSchema: {
      username: z.string().optional().describe('Instagram handle (used if url not given)'),
      url: z.string().optional().describe('profile_pic_url_hd from creator_research — skips the extra upstream lookup')
    }
  }, wrap(a => fetchAvatarDataUri(a)));

  return server;
}

const app = express();
app.set('trust proxy', 1);
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

// ---- Server-rendered full report (zero model-token cost; opened via signed link) ----
const researchCache = new Map();
async function getResearchCached(username) {
  const hit = researchCache.get(username);
  if (hit && hit.exp > Date.now()) return hit.data;
  const data = JSON.parse(await callApi('/v1/api/creator-research', { username })).data;
  researchCache.set(username, { data, exp: Date.now() + 10 * 60_000 });
  if (researchCache.size > 200) researchCache.delete(researchCache.keys().next().value);
  return data;
}

const nfmt = n => Number(n || 0).toLocaleString('en-US');
const toneC = t => t === 'warning' ? ['#9A6A12', '#F9F1DE'] : t === 'danger' ? ['#A32D2D', '#FCEBEB']
  : t === 'accent' ? ['#185FA5', '#E6F1FB'] : ['#0E6B4E', '#E8F2EE'];

function renderReport(d, a) {
  const cr = d.creator_research || {}, st = d.account_stats || {};
  const followers = d.followed_by_count || 0;
  const [tier, bench] = followers >= 500000 ? ['Macro 級', '1–2%'] : followers >= 100000 ? ['Mid 級', '1.5–3%']
    : followers >= 10000 ? ['Micro 級', '2–4%'] : ['Nano 級', '4–8%'];
  const er = st.avg_engagement_rate != null ? (st.avg_engagement_rate * 100).toFixed(2) + '%' : '—';
  const fake = st.fake_audience_score;
  const g30 = d.follower_growth?.growth_30d?.pct, g7 = d.follower_growth?.growth_7d?.pct;
  const [vc, vbg] = toneC(a.vTone);

  let spark = '';
  const series = (d.follower_growth?.series || []).filter(p => p.followers > 0);
  if (series.length >= 2) {
    const vals = series.map(p => p.followers), min = Math.min(...vals), max = Math.max(...vals);
    const pts = vals.map((v, i) => `${(i / (vals.length - 1) * 560).toFixed(1)},${(74 - (max === min ? 0 : (v - min) / (max - min)) * 62).toFixed(1)}`).join(' ');
    spark = `<svg viewBox="0 0 560 80" width="100%" height="80" preserveAspectRatio="none" role="img" aria-label="粉絲增長趨勢"><polyline points="${pts}" fill="none" stroke="#0E6B4E" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
  }

  const reels = (d.recent_reels || []).filter(r => r.play_count > 0).sort((x, y) => y.play_count - x.play_count).slice(0, 3);
  const gender = cr.audience_gender || {}, ages = cr.audience_age || {}, regions = cr.audience_regions || {};
  const abar = (l, v) => `<div class="ab"><span>${escapeHtml(l)}</span><div class="tk"><div style="width:${Math.min(100, v * 100).toFixed(0)}%"></div></div><b>${(v * 100).toFixed(1)}%</b></div>`;
  const agePairs = Object.entries(ages).sort((x, y) => y[1] - x[1]).slice(0, 3);
  const regionPairs = Object.entries(regions).sort((x, y) => y[1] - x[1]).slice(0, 3);

  const scoreRows = (Array.isArray(a.scores) ? a.scores : []).map(x => {
    const [c, cb] = toneC(x.t);
    return `<div class="row"><div style="flex:1"><div class="q">${escapeHtml(x.q)}</div><div class="r">${escapeHtml(x.r || '')}</div></div>
    <div style="text-align:right"><span class="chip" style="color:${c};background:${cb}">${escapeHtml(x.chip || '')}</span><div class="s">${escapeHtml(String(x.s ?? ''))} / 5</div></div></div>`;
  }).join('');

  const riskRows = (Array.isArray(a.risks) ? a.risks : []).map(r => {
    const [c, cb] = toneC(r.t);
    return `<div class="rk"><span class="chip" style="color:${c};background:${cb}">${escapeHtml(r.h || '')}</span><span class="mut">${escapeHtml(r.d || '')}</span></div>`;
  }).join('');

  const reelCards = reels.map(r => `<a class="reel" href="${escapeHtml(r.link)}" target="_blank" rel="noopener">
    <img src="${escapeHtml(r.thumbnail_url || '')}" alt="" loading="lazy" onerror="this.style.display='none'">
    <div><div class="q">${escapeHtml((r.caption_text || '').split('\n')[0].slice(0, 40))}</div>
    <div class="mut" style="font-size:12px">${nfmt(r.play_count)} 觀看 · ${nfmt(r.like_count)} 讚 · ${nfmt(r.comment_count)} 留言</div></div></a>`).join('');

  return `<!doctype html><html lang="zh-HK"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(d.full_name || d.username)} — KOL 合作評估報告</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#FBFCFB;color:#20262B;font-family:-apple-system,BlinkMacSystemFont,"PingFang HK","Noto Sans TC",sans-serif;font-size:15px;line-height:1.7}
.wrap{max-width:720px;margin:0 auto;padding:40px 20px 64px}.card{background:#fff;border:1px solid #E3E8E5;border-radius:12px;padding:20px 22px;margin-top:16px}
h2{font-size:17px;margin:0 0 12px}.mut{color:#5B6660}.chip{display:inline-block;font-size:12px;font-weight:600;padding:2px 10px;border-radius:6px;white-space:nowrap}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:16px}
.stat{background:#F2F5F3;border-radius:8px;padding:14px 16px}.stat .v{font-size:23px;font-weight:600;margin-top:2px}.stat .l,.stat .s{font-size:12.5px;color:#5B6660}
.row{display:flex;gap:12px;align-items:flex-start;background:#F2F5F3;border-radius:8px;padding:10px 14px;margin-bottom:8px}.q{font-size:14px;font-weight:600}.r{font-size:13px;color:#5B6660;margin-top:2px}.s{font-size:13px;color:#8A948E;margin-top:4px}
.ab{display:flex;align-items:center;gap:10px;font-size:13px;margin:6px 0}.ab span{width:72px;color:#5B6660}.ab b{width:52px;text-align:right;font-variant-numeric:tabular-nums}
.tk{flex:1;height:10px;background:#F2F5F3;border-radius:5px;overflow:hidden}.tk div{height:100%;background:#0E6B4E;border-radius:5px}
.reel{display:flex;gap:12px;align-items:center;text-decoration:none;color:inherit;border:1px solid #E3E8E5;border-radius:10px;padding:10px;margin-bottom:8px}
.reel img{width:64px;height:64px;border-radius:8px;object-fit:cover;flex-shrink:0}
.rk{display:flex;gap:8px;align-items:baseline;font-size:13.5px;margin:6px 0}
.gauge{position:relative;height:10px;border-radius:5px;overflow:hidden;display:flex;margin:14px 0 6px}
footer{margin-top:32px;font-size:12.5px;color:#8A948E;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
a.btn{display:inline-block;background:#0E6B4E;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:9px 18px;border-radius:8px}
@media(max-width:480px){.wrap{padding:24px 14px 48px}}
</style></head><body><div class="wrap">
<div class="card" style="margin-top:0;display:flex;gap:14px;align-items:center;flex-wrap:wrap">
<img src="${escapeHtml(d.profile_pic_url_hd || '')}" alt="" style="width:64px;height:64px;border-radius:50%;object-fit:cover" onerror="this.style.display='none'">
<div style="flex:1;min-width:200px"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span style="font-size:19px;font-weight:700">${escapeHtml(d.full_name || d.username)}</span>
<span class="chip" style="background:#F2F5F3;color:#5B6660">${tier}</span></div>
<div class="mut" style="font-size:13.5px"><a href="https://www.instagram.com/${escapeHtml(d.username)}/" target="_blank" rel="noopener" style="color:#0E6B4E">@${escapeHtml(d.username)}</a> · ${escapeHtml(a.sub || cr.creator_types || '')}</div></div>
<div style="text-align:right"><span class="chip" style="font-size:14px;padding:7px 14px;color:${vc};background:${vbg}">${escapeHtml(a.verdict || '評估報告')}</span>
${a.total ? `<div class="mut" style="font-size:13px;margin-top:5px">加權總分 ${escapeHtml(String(a.total))} / 5</div>` : ''}</div></div>
<div class="grid">
<div class="stat"><div class="l">粉絲數</div><div class="v">${nfmt(followers)}</div><div class="s" style="color:#0E6B4E">${g30 != null ? `30 日 ${g30 >= 0 ? '+' : ''}${(g30 * 100).toFixed(1)}%` : ''}${g7 != null ? ` · 7 日 ${g7 >= 0 ? '+' : ''}${(g7 * 100).toFixed(1)}%` : ''}</div></div>
<div class="stat"><div class="l">互動率 ER（API 實測）</div><div class="v">${er}</div><div class="s">${tier}基準 ${bench}</div></div>
<div class="stat"><div class="l">平均觀看</div><div class="v">${nfmt(st.avg_play_count)}</div><div class="s">近期 Reels</div></div>
<div class="stat"><div class="l">平均合作費</div><div class="v">${cr.avg_collab_fee ? '$' + nfmt(cr.avg_collab_fee) : '—'}</div><div class="s">HKD${cr.avg_rating ? ` · 評分 ${cr.avg_rating}/5` : ''}</div></div></div>
${scoreRows ? `<div class="card"><h2>五大評估</h2>${scoreRows}</div>` : ''}
${fake != null ? `<div class="card"><div style="display:flex;justify-content:space-between;align-items:baseline"><h2 style="margin:0">假粉絲分析（API 實測）</h2>
<span class="chip" style="color:${fake < 20 ? '#0E6B4E' : fake < 40 ? '#9A6A12' : '#A32D2D'};background:${fake < 20 ? '#E8F2EE' : fake < 40 ? '#F9F1DE' : '#FCEBEB'}">${fake} · ${st.risk_level || ''}</span></div>
<div class="gauge"><div style="flex:20;background:#BCD8CD"></div><div style="flex:20;background:#F3E3BC"></div><div style="flex:30;background:#EED9A0"></div><div style="flex:30;background:#F0C4C4"></div></div>
<div style="position:relative;height:0"><div style="position:absolute;left:${Math.min(99, fake)}%;top:-20px;width:2px;height:16px;background:#20262B"></div></div>
<div class="mut" style="font-size:13.5px;margin-top:10px">${escapeHtml(a.fake_note || '')}</div></div>` : ''}
${spark ? `<div class="card"><h2>粉絲增長</h2>${spark}</div>` : ''}
${reelCards ? `<div class="card"><h2>表現最佳內容</h2>${reelCards}</div>` : ''}
<div class="card"><h2>受眾輪廓</h2>
${gender.female != null ? abar('女性', gender.female) + abar('男性', gender.male || 0) : ''}
${agePairs.map(([k, v]) => abar(k + ' 歲', v)).join('')}
${regionPairs.map(([k, v]) => abar(k, v)).join('')}
<div class="mut" style="font-size:13.5px;margin-top:10px">${escapeHtml(a.audience || '')}</div></div>
${a.collabs ? `<div class="card"><h2>過往品牌合作</h2><div class="mut" style="font-size:13.5px">${escapeHtml(a.collabs)}</div></div>` : ''}
${riskRows ? `<div class="card"><h2>風險審查</h2>${riskRows}</div>` : ''}
${a.rec ? `<div class="card" style="background:${vbg};border-color:${vbg}"><h2 style="color:${vc}">${escapeHtml(a.verdict || '建議')}</h2><div style="color:${vc};font-size:14px">${escapeHtml(a.rec)}</div></div>` : ''}
<div style="margin-top:20px"><a class="btn" href="https://moodboard.today" target="_blank" rel="noopener">尋找更多網紅</a></div>
<footer><span>數據來源：Creator Recommendation API${d.last_updated ? ` · 更新至 ${escapeHtml(String(d.last_updated).slice(0, 10))}` : ''}</span><span>creator-analysis 生成</span></footer>
</div></body></html>`;
}

app.get('/report', async (req, res) => {
  const { d, exp, sig } = req.query;
  if (!d || !exp || !sig) return res.status(400).send('bad link');
  if (Number(exp) < Date.now() / 1000) return res.status(410).send('連結已過期，請重新生成報告');
  const want = Buffer.from(hmacUrl(`${d}|${exp}`)), got = Buffer.from(String(sig));
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return res.status(403).send('invalid signature');
  if (rateLimited(`rep:${req.ip || 'x'}`)) return res.status(429).send('rate limited');
  let payload;
  try { payload = JSON.parse(inflateRawSync(Buffer.from(String(d), 'base64url')).toString()); } catch { return res.status(400).send('bad payload'); }
  try {
    res.type('html').send(renderReport(await getResearchCached(payload.u), payload.a || {}));
  } catch (e) {
    console.error(e);
    res.status(502).send('上游數據暫時無法取得，請稍後重試');
  }
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
    const server = buildServer(baseUrl(req));
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
