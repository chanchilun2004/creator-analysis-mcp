# 單一 creator dashboard — 固定 widget 模板（效能關鍵）

**規則（必守，直接影響報告生成速度）：**
1. 下面模板**逐字照抄**，只可替換 `const D = {...}` 內的數據——不得重寫 CSS、不得改 layout、不得加新 section。
2. 文案長度上限：每項評分理由 ≤ 45 字；`postNote`／`audienceNote`／`rec` 各 ≤ 90 字；風險描述 ≤ 30 字。超出會拖慢生成。
3. `avatar`：填 `creator_avatar` 回傳的 data URI；工具失敗時填空字串 `""`（模板自動顯示 `initials` 圈）。
4. 多 creator 比較模式不用此模板（跟 report-template.md 的比較表規格，同樣從簡）。

```html
<style>
.kw{padding:1rem 0;font-family:var(--font-sans);color:var(--text-primary)}
.kw .card{background:var(--surface-2);border:.5px solid var(--border);border-radius:12px;padding:1rem 1.25rem;margin-top:1.2rem}
.kw .h{font-size:16px;font-weight:500;margin-bottom:10px}
.kw .sm{font-size:13px;line-height:1.6}
.kw .mut{color:var(--text-secondary)}
.kw .row{display:flex;align-items:flex-start;gap:12px;background:var(--surface-1);border-radius:8px;padding:10px 14px}
.kw .stat{background:var(--surface-1);border-radius:8px;padding:.85rem 1rem}
.kw .big{font-size:24px;font-weight:500;margin-top:2px}
.kw .chip{font-size:12px;font-weight:500;padding:2px 10px;border-radius:8px;white-space:nowrap}
</style>
<div class="kw" id="kw"></div>
<script>
const D = {
  avatar:"", initials:"XX", name:"NAME", handle:"handle", tier:"Micro 級",
  sub:"一句定位", verdict:"建議合作", vTone:"success", total:"4.5",
  stats:[{l:"粉絲數",v:"17,909",s:"30日 +16.6%",g:1},{l:"互動率 ER",v:"8.58%",s:"基準 2–4% · API 實測"},{l:"平均觀看",v:"26,343",s:"熱門逾 18 萬"},{l:"平均合作費",v:"$1,160",s:"HKD"}],
  scores:[{q:"數據表現理想嗎？",chip:"放心",t:"success",s:5,r:"理由 ≤45 字"},{q:"粉絲是你的目標客嗎？",chip:"中等",t:"accent",s:4,r:""},{q:"與品牌合作過嗎？",chip:"中等",t:"accent",s:4,r:""},{q:"有風險嗎？",chip:"放心",t:"success",s:4.5,r:""},{q:"內容質素高嗎？",chip:"放心",t:"success",s:4.5,r:""}],
  fake:{score:4.6,label:"4.6 · 極低風險",note:"一句結論 ≤60 字"},
  posts:[{t:"標題",m:"18.3 萬觀看 · 4,987 讚",link:"https://..."}],
  audience:"受眾一句總結（性別／年齡／地區）≤90 字",
  collabs:"過往合作一句總結 ≤90 字",
  risks:[{t:"success",h:"假粉",d:"≤30 字"},{t:"warning",h:"留意位",d:"≤30 字"}],
  rec:"建議合作形式＋條件 ≤90 字",
  ctas:[{t:"深入分析 ↗",p:"就 @HANDLE 做深入分析：內容主題分佈、最佳發文時段、同級比較"},{t:"草擬合作邀請訊息 ↗",p:"幫我草擬俾 @HANDLE 嘅合作邀請訊息"},{t:"尋找更多網紅",link:"https://moodboard.today"}],
  src:"數據來源：Creator Recommendation API · 更新至 YYYY-MM-DD"
};
const bg=t=>({success:"var(--bg-success)",accent:"var(--bg-accent)",warning:"var(--bg-warning)",danger:"var(--bg-danger)"}[t]);
const fg=t=>({success:"var(--text-success)",accent:"var(--text-accent)",warning:"var(--text-warning)",danger:"var(--text-danger)"}[t]);
const e=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;");
const av=D.avatar?`<img src="${D.avatar}" alt="" style="width:48px;height:48px;border-radius:50%;object-fit:cover;flex-shrink:0">`
 :`<div style="width:48px;height:48px;border-radius:50%;background:var(--bg-accent);color:var(--text-accent);display:flex;align-items:center;justify-content:center;font-weight:500;flex-shrink:0">${e(D.initials)}</div>`;
document.getElementById("kw").innerHTML=
`<div class="card" style="margin-top:0;display:flex;align-items:center;gap:14px">${av}
<div style="flex:1;min-width:0"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span style="font-size:16px;font-weight:500">${e(D.name)}</span><span class="chip mut" style="background:var(--surface-1);border:.5px solid var(--border)">${e(D.tier)}</span></div>
<div class="sm mut" style="margin-top:2px">@${e(D.handle)} · ${e(D.sub)}</div></div>
<div style="text-align:right;flex-shrink:0"><span class="chip" style="font-size:13px;padding:6px 12px;background:${bg(D.vTone)};color:${fg(D.vTone)}">${e(D.verdict)}</span><div class="sm mut" style="margin-top:4px">加權總分 ${D.total} / 5</div></div></div>`
+`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:1rem">`+D.stats.map(s=>`<div class="stat"><div class="sm mut">${e(s.l)}</div><div class="big">${e(s.v)}</div><div style="font-size:12px;margin-top:2px;color:${s.g?"var(--text-success)":"var(--text-muted)"}">${e(s.s)}</div></div>`).join("")+`</div>`
+`<div style="margin-top:1.2rem"><div class="h">五大評估</div><div style="display:flex;flex-direction:column;gap:8px">`+D.scores.map(x=>`<div class="row"><div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:500">${e(x.q)}</div><div class="sm mut" style="margin-top:2px">${e(x.r)}</div></div><div style="text-align:right;flex-shrink:0"><span class="chip" style="background:${bg(x.t)};color:${fg(x.t)}">${e(x.chip)}</span><div class="sm" style="color:var(--text-muted);margin-top:4px">${x.s} / 5</div></div></div>`).join("")+`</div></div>`
+`<div class="card" style="background:var(--surface-1)"><div style="display:flex;justify-content:space-between;align-items:baseline"><span class="h" style="margin:0">假粉絲分析</span><span class="chip" style="background:var(--bg-success);color:var(--text-success)">${e(D.fake.label)}</span></div>
<div style="position:relative;height:10px;border-radius:5px;margin:14px 0 4px;overflow:hidden;display:flex"><div style="flex:20;background:var(--bg-success)"></div><div style="flex:20;background:var(--bg-warning);opacity:.5"></div><div style="flex:30;background:var(--bg-warning)"></div><div style="flex:30;background:var(--bg-danger)"></div></div>
<div style="position:relative;height:0"><div style="position:absolute;left:${D.fake.score}%;top:-16px;width:2px;height:16px;background:var(--text-primary)"></div></div>
<div class="sm mut" style="margin-top:8px">${e(D.fake.note)}</div></div>`
+`<div style="margin-top:1.2rem"><div class="h">表現最佳內容</div><div style="display:flex;flex-direction:column;gap:8px">`+D.posts.map(p=>`<a class="row" href="${p.link}" style="text-decoration:none;color:inherit"><div style="flex:1;min-width:0"><span style="font-size:14px;font-weight:500">${e(p.t)}</span><span class="sm mut">　${e(p.m)}</span></div><span class="mut">↗</span></a>`).join("")+`</div></div>`
+`<div class="card"><div class="h">受眾匹配</div><div class="sm mut">${e(D.audience)}</div><div class="h" style="margin-top:14px">過往品牌合作</div><div class="sm mut">${e(D.collabs)}</div><div class="h" style="margin-top:14px">風險審查</div><div style="display:flex;flex-direction:column;gap:6px">`+D.risks.map(r=>`<div class="sm"><span class="chip" style="background:${bg(r.t)};color:${fg(r.t)}">${e(r.h)}</span>　<span class="mut">${e(r.d)}</span></div>`).join("")+`</div></div>`
+`<div style="margin-top:1.2rem;background:${bg(D.vTone)};border-radius:12px;padding:1rem 1.25rem"><div style="font-size:15px;font-weight:500;color:${fg(D.vTone)}">${e(D.verdict)}</div><div class="sm" style="color:${fg(D.vTone)};margin-top:6px">${e(D.rec)}</div></div>`
+`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:1.2rem">`+D.ctas.map(c=>c.link?`<button onclick="openLink('${c.link}')">${e(c.t)}</button>`:`<button onclick="sendPrompt('${c.p.replace(/'/g,"\\'")}')">${e(c.t)}</button>`).join("")+`</div>`
+`<div class="sm" style="color:var(--text-muted);margin-top:1rem;text-align:right;font-size:11px">${e(D.src)}</div>`;
</script>
```
