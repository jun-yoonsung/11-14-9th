import { TYPES } from "./stats.js";
import { build } from "./detail.js";
import { Api } from "./api.js";
import { esc, dateKo, dateIso, beadColor, topText, metricNote } from "./format.js";
import { CAREER, careerPlot, careerSummary } from "./career.js";
import { svgString } from "./chart.js";
import { qualFor } from "./season.js";
import { paginate } from "./paginate.js";
import { TEAM_COLORS, TEAM_METHOD, teamPlot, teamSummary, wpText } from "./teamview.js";
  const T = () => TYPES;

  const CSS = `
  .rp, .rp * { box-sizing: border-box; margin: 0; padding: 0; }
  .rp { font-family: "Noto Sans KR", "Apple SD Gothic Neo", sans-serif; color: #121a2b; font-size: 10.5pt; line-height: 1.6; width: 210mm; background: #fff; }
  .rp-page { position: relative; width: 210mm; height: 296mm; padding: 16mm 17mm 20mm; overflow: hidden; background: #fff; page-break-after: always; }
  .rp-page:last-child { page-break-after: auto; }
  .rp-top { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1.5pt solid #121a2b; padding-bottom: 3mm; font-size: 9pt; color: #5c667d; }
  .rp-top b { font-family: "Hahmlet", serif; font-size: 11pt; color: #121a2b; font-weight: 800; }
  .rp-title { margin: 9mm 0 2mm; font-family: "Hahmlet", serif; font-weight: 800; font-size: 23pt; line-height: 1.25; letter-spacing: -0.01em; }
  .rp-meta { color: #5c667d; font-size: 10pt; }
  .rp-sec { margin-top: 9mm; }
  .rp-sec h2 { font-family: "Hahmlet", serif; font-weight: 800; font-size: 12.5pt; padding-bottom: 1.5mm; border-bottom: 0.75pt solid #d6dbe6; margin-bottom: 4mm; }
  .rp-kpis { display: grid; grid-template-columns: repeat(var(--cols, 3), 1fr); gap: 0; border: 0.75pt solid #d6dbe6; }
  .rp-kpi { padding: 3.5mm 4mm; border-right: 0.75pt solid #d6dbe6; border-bottom: 0.75pt solid #d6dbe6; margin: 0 -0.75pt -0.75pt 0; }
  .rp-kpi small { display: block; font-size: 8.5pt; color: #5c667d; }
  .rp-kpi strong { display: block; font-family: "Hahmlet", serif; font-weight: 800; font-size: 20pt; line-height: 1.2; }
  .rp-kpi em { font-style: normal; font-size: 8.5pt; font-weight: 700; color: #5c667d; }
  .rp-kpi em.good { color: #17734f; } .rp-kpi em.bad { color: #c8302a; }
  .rp-pcts { display: flex; flex-direction: column; gap: 5mm; }
  .rp-pct { display: grid; grid-template-columns: 24mm 1fr 38mm; gap: 4mm; align-items: center; }
  .rp-pct b { font-size: 10pt; }
  .rp-pct b small { display: block; font-weight: 400; font-size: 8pt; color: #5c667d; }
  .rp-track { position: relative; height: 2.2mm; border-radius: 1.1mm; background: linear-gradient(90deg, #2f5bd3 0%, #c9cfdc 50%, #c8302a 100%); }
  .rp-bead { position: absolute; top: 50%; width: 7mm; height: 7mm; margin: -3.5mm 0 0 -3.5mm; border-radius: 50%; border: 0.9mm solid #fff; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 8pt; font-weight: 700; box-shadow: 0 0 0 0.3pt #aab2c4; line-height: 1; }
  .rp-pv { font-size: 9pt; color: #5c667d; }
  .rp-pv b { color: #121a2b; }
  .rp-scale { display: grid; grid-template-columns: 24mm 1fr 38mm; gap: 4mm; margin-top: -1.5mm; font-size: 8pt; color: #5c667d; }
  .rp-scale div { display: flex; justify-content: space-between; }
  .rp-callout { background: #f3f5f9; border-left: 1.2mm solid #1d3fbb; padding: 3.5mm 4.5mm; }
  .rp table { width: 100%; border-collapse: collapse; font-size: 9.5pt; font-variant-numeric: tabular-nums; }
  .rp th, .rp td { padding: 2.2mm 2.5mm; text-align: right; border-bottom: 0.5pt solid #d6dbe6; }
  .rp th { font-weight: 500; font-size: 8.5pt; color: #5c667d; border-bottom: 1pt solid #121a2b; }
  .rp th:first-child, .rp td:first-child { text-align: left; }
  .rp td.good { color: #17734f; font-weight: 700; } .rp td.bad { color: #c8302a; font-weight: 700; }
  .rp tr.lg td { color: #5c667d; background: #f7f8fb; }
  .rp ul { list-style: none; display: flex; flex-direction: column; gap: 1.6mm; font-size: 9.5pt; color: #2b3550; }
  .rp li { padding-left: 4mm; position: relative; }
  .rp li::before { content: ""; position: absolute; left: 0; top: 2.4mm; width: 1.6mm; height: 1.6mm; border-radius: 50%; background: #1d3fbb; }
  .rp-foot { position: absolute; left: 17mm; right: 17mm; bottom: 9mm; display: flex; justify-content: space-between; border-top: 0.75pt solid #d6dbe6; padding-top: 2.5mm; font-size: 8pt; color: #5c667d; }
  .rp-tm { margin-bottom: 5mm; }
  .rp-tm h3 { font-size: 10pt; margin-bottom: 1.5mm; }
  .rp-tbar { display: grid; grid-template-columns: 34mm 1fr 18mm; gap: 3mm; align-items: center; padding: 0.7mm 0; font-size: 9pt; }
  .rp-tt { position: relative; height: 3.6mm; background: #eef1f6; border-radius: 0.8mm; }
  .rp-tf { position: absolute; top: 0; bottom: 0; left: 0; background: #98a3bd; border-radius: 0.8mm; }
  .rp-tbar.best .rp-tf { background: #1d3fbb; }
  .rp-tbar.best b { color: #1d3fbb; }
  .rp-tavg { position: absolute; top: -0.8mm; bottom: -0.8mm; width: 0.5mm; background: #c8302a; }
  .rp-tzero { position: absolute; top: -0.8mm; bottom: -0.8mm; left: 50%; width: 0.3mm; background: #5c667d; }
  .rp-tv { text-align: right; font-weight: 700; }
  .rp-head { font-size: 11pt; line-height: 1.75; margin-bottom: 3.5mm; }
  .rp-head b { color: #1d3fbb; }
  .rp-two { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
  .rp-card { border: 0.75pt solid #d6dbe6; border-top: 1.2mm solid #1d3fbb; padding: 3mm 4mm; }
  .rp-card.pos { border-top-color: #17734f; } .rp-card.neg { border-top-color: #c8302a; }
  .rp-card h3 { font-size: 10pt; margin-bottom: 1.5mm; }
  .rp-card .it { padding: 1.6mm 0; border-top: 0.5pt solid #e4e8f0; font-size: 9pt; line-height: 1.45; }
  .rp-card .it:first-of-type { border-top: 0; }
  .rp-card .it small { display: block; color: #5c667d; font-size: 8pt; }
  .rp-grp { display: grid; grid-template-columns: 46mm 1fr 20mm; gap: 4mm; align-items: center; padding: 2.2mm 0; border-bottom: 0.5pt solid #e4e8f0; }
  .rp-grp b { font-size: 9.5pt; } .rp-grp b small { display: block; font-weight: 400; font-size: 7.8pt; color: #5c667d; }
  .rp-gb { height: 3.4mm; background: #eef1f6; border-radius: 0.8mm; }
  .rp-gb i { display: block; height: 100%; background: #98a3bd; border-radius: 0.8mm; } .rp-gb i.hi { background: #1d3fbb; } .rp-gb i.lo { background: #c8302a; }
  .rp-gv { text-align: right; font-family: "Hahmlet", serif; font-weight: 800; font-size: 13pt; line-height: 1.1; }
  .rp-gv small { display: block; font-family: "Noto Sans KR", sans-serif; font-weight: 400; font-size: 7.5pt; color: #5c667d; }
  .rp tr.gh td { background: #eaf0fc; font-weight: 700; font-size: 8.5pt; color: #1a2b55; padding: 1.4mm 2.5mm; text-align: left; }
  .rp-mpw { display: flex; align-items: center; justify-content: flex-end; gap: 1.5mm; }
  .rp-mpw b { width: 6mm; text-align: right; font-weight: 700; }
  .rp-mp { width: 18mm; height: 2mm; background: #e4e8f0; border-radius: 1mm; overflow: hidden; }
  .rp-mp div { height: 100%; background: #1d3fbb; }
  .rp-stk { display: grid; grid-template-columns: 16mm 1fr; gap: 3mm; align-items: center; margin-top: 2mm; font-size: 9pt; }
  .rp-sb { display: flex; height: 6.5mm; border-radius: 1mm; overflow: hidden; background: #eef1f6; }
  .rp-sb span { color: #fff; font-size: 7.5pt; display: flex; align-items: center; justify-content: center; overflow: hidden; white-space: nowrap; }
  .rp-leg { display: flex; flex-wrap: wrap; gap: 1mm 4mm; margin: 2mm 0 0 19mm; font-size: 8pt; color: #5c667d; }
  .rp-leg i { display: inline-block; width: 2.2mm; height: 2.2mm; border-radius: 0.5mm; margin-right: 1.2mm; }
  .rp-sim { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
  .rp-sim div { border: 0.75pt solid #d6dbe6; padding: 2.5mm 3.5mm; font-size: 8.5pt; line-height: 1.45; }
  .rp-sim b { display: block; font-size: 10.5pt; } .rp-sim em { font-style: normal; color: #1d3fbb; font-weight: 700; }
  .rp-sim small { display: block; color: #5c667d; font-size: 7.8pt; }
  .rp-sm th, .rp-sm td { font-size: 8.5pt; padding: 1.7mm 2mm; }
  .rp-note { font-size: 8.8pt; }
  .rp-ai { border: 0.75pt solid #d6dbe6; border-left: 1.2mm solid #1d3fbb; padding: 3.5mm 4.5mm; font-size: 9.5pt; line-height: 1.6; }
  .rp-ai p { margin-bottom: 1.8mm; } .rp-ai h3 { font-size: 9.5pt; margin: 2.2mm 0 0.8mm; }
  .rp-ai ul { padding-left: 4mm; } .rp-ai li { margin: 0.6mm 0; }
  .rp-fine { font-size: 7.8pt; color: #5c667d; line-height: 1.5; margin-top: 1.8mm; }
  .rp-fcbox svg { width: 100%; height: auto; display: block; }
  .rp-fcx { position: relative; height: 4mm; font-size: 7.8pt; color: #5c667d; margin-top: 1mm; }
  .rp-fcx span { position: absolute; top: 0; transform: translateX(-50%); white-space: nowrap; }
  .rp-cbox { position: relative; } .rp-cbox svg { width: 100%; height: auto; display: block; }
  .rp-cbox .y { position: absolute; left: 0.6%; transform: translateY(-50%); font-size: 7.5pt; color: #5c667d; background: #fff; padding: 0 0.6mm; }
  .rp-leg2 { display: flex; flex-wrap: wrap; gap: 1mm 5mm; font-size: 8pt; color: #5c667d; margin-bottom: 1.5mm; }
  .rp-leg2 i { display: inline-block; width: 5mm; height: 0; border-top: 0.9mm solid; margin-right: 1.5mm; vertical-align: middle; } .rp-leg2 i.d { border-top-style: dashed; border-top-width: 0.6mm; }
  .rp-two2 { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; } .rp-two2 > div { border: 0.75pt solid #d6dbe6; padding: 2.5mm 3.5mm; font-size: 9pt; line-height: 1.55; }
  .rp-two2 h3 { font-size: 10pt; margin-bottom: 1mm; } .rp-two2 li { margin: 0.5mm 0 0 3.5mm; }
  .rp-cbar { margin: 2.2mm 0; } .rp-cbar > b { display: block; font-size: 9pt; margin-bottom: 0.6mm; }
  .rp-crow { display: grid; grid-template-columns: 1fr 8mm; gap: 2mm; align-items: center; font-size: 7.8pt; color: #5c667d; margin: 0.5mm 0; }
  .rp-ct { height: 2.6mm; background: #eceff5; border-radius: 1.3mm; } .rp-ct i { display: block; height: 100%; border-radius: 1.3mm; }
  .rp-cmpt td small { color: #5c667d; margin-left: 1mm; font-size: 7pt; } .rp-cmpt td.ld { font-weight: 700; }
  .rp-mn li { margin: 0.8mm 0 0.8mm 4mm; font-size: 9pt; } .rp-mn b { margin-right: 1.2mm; }
  `;

  const kpiTone = l => (l.value == null ? "" : l.tone);
  const kpiNote = l => (l.value == null ? "기록 없음" : l.tone === "even" ? "리그 평균과 같음" : `리그보다 ${l.diffDisplay}`);
  const pageWrap = (inner, n, total, rec) => `<section class="rp-page">
    <div class="rp-top"><b>야구 분석 랩</b><span>분석 보고서, ${esc(dateKo(rec.createdAt))}</span></div>
    ${inner}
    <div class="rp-foot"><span>화면과 보고서의 선수와 팀 기록은 KBO ${rec.season} 정규시즌 기록입니다.</span><span>${n} / ${total}</span></div></section>`;

  const METHOD = { ml: "머신러닝 모델", marcel: "최근 3시즌 가중 평균", league: "리그 평균" };
  const f3 = v => Number(v).toFixed(3);

  // 미리 만들어 둔 AI 해설 (tools/gen_commentary.mjs)
  function aiBlock(c, rec) {
    const lines = (rec && rec.result.lines) || [];
    if (!c && !lines.length) return "";
    const ul = a => (a && a.length ? `<ul>${a.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : "");
    const met = lines.length ? `<h2 style="margin-top:6mm">고른 지표 해설</h2><ul class="rp-mn">${lines.map(l => `<li><b>${esc(l.label)}</b>${esc((c && c.metrics && c.metrics[l.label]) || metricNote(l))}</li>`).join("")}</ul>` : "";
    const body = c ? `<div class="rp-ai"><p><b>${esc(c.summary)}</b></p>${c.style ? `<p>${esc(c.style)}</p>` : ""}
      ${c.strengths && c.strengths.length ? `<h3>눈에 띄는 점</h3>${ul(c.strengths)}` : ""}${c.watch && c.watch.length ? `<h3>보완하거나 주의할 점</h3>${ul(c.watch)}` : ""}${c.similar ? `<p style="margin-top:2mm">${esc(c.similar)}</p>` : ""}</div>
      <p class="rp-fine">AI가 이 보고서의 계산 수치만 바탕으로 미리 작성한 설명입니다. 숫자는 계산값과 대조해 확인했지만 해석은 참고용입니다. 지표 해설 중 AI 문장이 없는 지표는 계산값으로 만든 문장입니다.</p>` : `<p class="rp-fine">이 선수는 AI 해설이 없어 계산값으로 만든 문장을 보여 줍니다.</p>`;
    return `<div class="rp-sec"><h2>${c ? "AI 해설" : "지표 해설"}</h2>${body}${c ? met : met.replace(/^<h2[^>]*>고른 지표 해설<\/h2>/, "")}</div>`;
  }

  /** 계산된 좌표로 그래프 한 개를 만든다. 글자는 PDF 변환에서 글꼴이 깨지지 않도록 HTML로 얹는다. */
  function chartBox(g) {
    const ys = g.yt.map(t => `<span class="y" style="top:${(t.y / g.H) * 100}%">${t.label}</span>`).join("");
    const xs = `<div class="rp-fcx">${g.xt.map(t => `<span style="left:${(t.x / g.W) * 100}%">${esc(t.label)}</span>`).join("")}</div>`;
    return `<div class="rp-cbox">${svgString(g)}${ys}</div>${xs}`;
  }

  // 커리어: 지난 시즌 기록 + 리그 평균 + 예측을 한 그래프로
  function careerBlock(extra, rec) {
    const rows = extra.career && extra.career.players[rec.type][String(rec.params.target)];
    if (!rows || rows.length < 2) return "";
    const C = CAREER[rec.type], isBat = rec.type === "batter", fc = extra.fc, p = fc && fc.players[String(rec.params.target)];
    const cp = careerPlot(rec.type, rows, extra.career.league[rec.type], p, fc, { W: 600, H: 190, L: 44, R: 10, T: 10, B: 8 });
    if (!cp || !cp.geom) return "";
    const sm = careerSummary(rec.type, rows), n = (v, d) => (v == null ? "-" : Number(v).toFixed(d));
    const heads = isBat ? ["시즌", "나이", "팀", "경기", "타석", "타율", "출루율", "장타율", "OPS", "홈런"] : ["시즌", "나이", "팀", "경기", "이닝", "ERA", "WHIP", "K/9", "승", "패", "세이브"];
    const shown = rows.slice(-12).reverse();
    const trs = shown.map(r => `<tr>${r.map((v, i) => `<td>${esc(isBat ? (i >= 5 && i <= 8 ? n(v, 3) : v == null ? "-" : v) : (i === 4 || i === 7 ? n(v, 1) : i === 5 || i === 6 ? n(v, 2) : v == null ? "-" : v))}</td>`).join("")}</tr>`).join("");
    return `<div class="rp-sec"><h2>커리어와 앞으로 (${sm.first}~${sm.last})</h2>
      <p class="rp-pv" style="margin-bottom:2mm">데뷔 이후 시즌별 ${C.stat}입니다. ${isBat ? "50타석" : "20이닝"} 미만인 시즌은 그래프에서 뺐습니다. ${C.better === "low" ? "ERA는 낮을수록 좋은 기록입니다." : "OPS는 높을수록 좋은 기록입니다."}</p>
      <div class="rp-leg2"><span><i style="border-color:#101216"></i>선수 ${C.stat}</span><span><i class="d" style="border-color:#8e96a6"></i>리그 평균(${isBat ? "100타석" : "30이닝"} 이상 선수 평균)</span>${cp.useFc ? '<span><i class="d" style="border-color:#5e6ad2"></i>앞으로 예측(옅은 띠: 80% 범위)</span>' : ""}</div>
      ${chartBox(cp.geom)}
      <ul class="rp-note" style="margin-top:2mm"><li>${sm.first}~${sm.last} 시즌 ${sm.seasons}시즌.${isBat ? ` 통산 홈런 ${sm.hr}개, 통산 ${sm.tot}타석.` : ` 통산 ${sm.w}승 ${sm.l}패 ${sm.sv}세이브, ${n(sm.tot, 1)}이닝.`}</li>
        ${sm.peak ? `<li>가장 좋았던 시즌은 ${sm.peak[0]}년(${sm.peak[1]}세)으로 ${C.stat} ${n(sm.peak[C.main], C.digits)}입니다(${isBat ? "200타석" : "50이닝"} 이상 시즌 중).</li>` : ""}
        ${sm.avgMain != null ? `<li>통산 ${C.stat}은 ${n(sm.avgMain, C.digits)}입니다(${isBat ? "시즌 OPS를 타석으로 가중 평균한 약식 값" : "이닝으로 가중 평균한 값"}).</li>` : ""}</ul>
      <table class="rp-sm" style="margin-top:2.5mm"><thead><tr>${heads.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${trs}</tbody></table>
      ${rows.length > 12 ? `<p class="rp-fine">최근 12시즌만 표시했습니다.</p>` : ""}
      <p class="rp-fine">출처: Kaggle KBO Player Stats 1982–2026 (netsong, KBO 공식 기록 기반, CC BY-NC-SA 4.0). 시즌 중 팀을 옮긴 선수는 시즌 기록을 합쳐 계산했습니다.</p></div>`;
  }

  // OPS·ERA 외 다른 지표 예측 표(forecast_extra.json)
  const PCTK = ["K", "BBr", "HRr"], fxv = (k, v, d) => (PCTK.includes(k) ? `${(v * 100).toFixed(1)}%` : Number(v).toFixed(d));
  function extraTable(ex, p, rec, fc) {
    const e = ex && ex.players[String(rec.params.target)], list = ex && ex.meta.stats[rec.type];
    if (!e || !list) return "";
    const b = fc.meta.base_season, rows = list.filter(s => e[s.key]).map(s => `<tr><td>${esc(s.label)}</td><td>${fxv(s.key, e[s.key].now, s.digits)}</td>${e[s.key].pred.map(q => `<td>${fxv(s.key, q.mid, s.digits)}</td>`).join("")}</tr>`).join("");
    return `<p class="rp-pv" style="margin-top:2.5mm"><b>다른 지표 예측</b> (예상값, OPS·ERA보다 단순한 모델이라 참고용)</p><table class="rp-sm"><thead><tr><th>지표</th><th>${b} (올해)</th>${[1, 2, 3, 4, 5].map(h => `<th>${b + h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  // 앞으로 5년 예측 (ml/train_forecast.py). 그래프는 도형만 그리고 글자는 HTML로 둔다(PDF 변환에서 글꼴이 깨지지 않게)
  function forecastBlock(fc, p, rec, fxAll) {
    if (!fc || !p || rec.season !== fc.meta.base_season) return "";
    const isBat = p.type === "batter", name = isBat ? "OPS" : "평균자책점(ERA)", m = fc.meta.metrics[p.type], e1 = m.reg[1], a1 = m.act[1];
    const pts = [{ year: fc.meta.base_season, mid: p.now, lo: p.now, hi: p.now }, ...p.pred];
    const W = 600, H = 150, L = 8, R = 8, T0 = 8, B0 = 8, vals = pts.flatMap(x => [x.lo, x.hi]);
    const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.12 || 0.1, y0 = lo - pad, y1 = hi + pad;
    const X = i => L + (i / (pts.length - 1)) * (W - L - R), Y = v => T0 + (1 - (v - y0) / (y1 - y0)) * (H - T0 - B0);
    const band = `${pts.map((x, i) => `${i ? "L" : "M"}${X(i)},${Y(x.hi)}`).join(" ")} ${pts.slice().reverse().map((x, i) => `L${X(pts.length - 1 - i)},${Y(x.lo)}`).join(" ")}Z`;
    const line = pts.map((x, i) => `${i ? "L" : "M"}${X(i)},${Y(x.mid)}`).join(" ");
    const svg = `<svg viewBox="0 0 ${W} ${H}"><rect x="0" y="0" width="${W}" height="${H}" fill="#fff" stroke="#e4e8f0"/><path d="${band}" fill="#e3e8f9"/><path d="${line}" fill="none" stroke="#1d3fbb" stroke-width="2.2"/>${pts.map((x, i) => `<circle cx="${X(i)}" cy="${Y(x.mid)}" r="${i ? 4 : 5}" fill="${i ? "#1d3fbb" : "#111"}" stroke="#fff" stroke-width="1.5"/>`).join("")}</svg>`;
    const xl = `<div class="rp-fcx">${pts.map((x, i) => `<span style="left:${(X(i) / W) * 100}%">${x.year}${i ? "" : " (올해)"}</span>`).join("")}</div>`;
    const rows = p.pred.map(x => `<tr><td>${x.year}</td><td>${x.age}세</td><td>${f3(x.mid)}</td><td>${f3(x.lo)} ~ ${f3(x.hi)}</td><td>${Math.round(x.active * 100)}%</td><td>${METHOD[x.method]}</td></tr>`).join("");
    const retire = p.retire_by ? `현역 확률이 50% 아래로 내려가는 첫 나이는 ${p.retire_by}세로 예측됩니다.` : "향후 5년 안에는 현역 확률이 50% 아래로 내려가지 않는 것으로 예측됩니다.";
    const weak = p.pred.filter(x => x.method !== "ml");
    return `<div class="rp-sec"><h2>앞으로 5년 예측 (실험적 기능)</h2>
      <p class="rp-pv" style="margin-bottom:2mm">과거 KBO 선수들의 시즌 기록(1990~${fc.meta.base_season})으로 학습한 모델이 향후 ${name}과 현역으로 남아 있을 확률을 예측했습니다. 한 시즌의 우연한 변동은 평균 쪽으로 되돌아가는 경향이 있어, 올해 기록이 매우 좋거나 나빴다면 예측은 평균에 가깝게 나옵니다.</p>
      <div class="rp-fcbox">${svg}${xl}</div><p class="rp-fine">선은 예측값, 옅은 띠는 실제 값이 들어올 가능성이 80%인 범위입니다. 먼 미래일수록 띠가 넓습니다.</p>
      <table class="rp-sm" style="margin-top:2mm"><thead><tr><th>시즌</th><th>나이</th><th>예상 ${isBat ? "OPS" : "ERA"}</th><th>80% 범위</th><th>현역일 확률</th><th>예측 방법</th></tr></thead><tbody>
        <tr><td>${fc.meta.base_season} (올해)</td><td>${p.age}세</td><td>${f3(p.now)}</td><td>-</td><td>-</td><td>실제 기록</td></tr>${rows}</tbody></table>
      ${extraTable(fxAll, p, rec, fc)}
      <p class="rp-pv" style="margin-top:2mm"><b>은퇴 시기</b>: ${retire} 현역 확률은 그 해에 KBO 1군 기록이 남아 있을 확률이며, 부상·군 복무·해외 진출도 "기록 없음"으로 잡힙니다.</p>
      <ul class="rp-note" style="margin-top:1.5mm">
        <li>${fc.meta.base_season - 2}~${fc.meta.base_season} 시즌은 학습에 쓰지 않고 따로 떼어 맞혀 봤습니다. 1년 뒤 ${isBat ? "OPS" : "ERA"} 평균 오차는 약 ${f3(e1.mae_chosen)}로 작년 기록을 그대로 쓰는 방법(${f3(e1.mae_last)})보다 작았고, 80% 범위 적중률은 ${Math.round(e1.coverage80 * 100)}%였습니다.</li>
        <li>현역 여부는 1년 뒤 기준 ${Math.round(a1.auc * 100)}점(100점 만점, 50점이 동전 던지기 수준)으로 구분했습니다.</li>
        ${weak.length ? `<li>${weak.map(x => x.year).join(", ")} 시즌 예측은 시험에서 머신러닝 모델이 더 낫지 않아 ${METHOD[weak[0].method]} 방식으로 대신했습니다.</li>` : ""}
        <li>그 선수가 그 해에 충분히 뛴다는 가정(타자 100타석, 투수 30이닝 이상)의 값이며 부상·보직 변경은 반영하지 못합니다.</li></ul>
      <p class="rp-fine">학습 데이터: Kaggle KBO Player Stats 1982–2026 (netsong, KBO 공식 기록 기반, CC BY-NC-SA 4.0). 학습용·비영리 프로젝트에서만 사용합니다.</p></div>`;
  }

  // AI 해설과 예측은 내용이 길어 각각 한 쪽으로 만든다 (없는 쪽은 만들지 않는다)
  function extraPages(extra, rec) {
    if (!extra) return [];
    return [aiBlock(extra.ai, rec), careerBlock(extra, rec), forecastBlock(extra.fc, extra.fc && extra.fc.players[String(rec.params.target)], rec, extra.fx)].filter(Boolean).map(b => `<div style="margin-top:9mm">${b}</div>`);
  }

  function playerPages(rec, d, extra) {
    const r = rec.result, ty = T()[rec.type], s = r.subject;
    const teamName = r.teamName || s.team;
    const kpis = r.lines.map(l => `<div class="rp-kpi"><small>${esc(l.label)}${l.label !== l.en ? " " + esc(l.en) : ""}</small><strong>${esc(l.display)}</strong><em class="${kpiTone(l)}">${esc(kpiNote(l))}</em></div>`).join("");
    const bars = r.lines.map(l => {
      const head = `<b>${esc(l.label)}${l.label !== l.en ? `<small>${esc(l.en)}</small>` : ""}</b>`;
      if (l.pct == null) return `<div class="rp-pct">${head}<div class="rp-pv">기록이 없어 위치를 표시하지 않습니다.</div><div class="rp-pv"><b>-</b></div></div>`;
      return `<div class="rp-pct">${head}<div class="rp-track"><span class="rp-bead" style="left:clamp(0%,${l.pct}%,100%);background:${beadColor(l.pct)}">${l.pct}</span></div><div class="rp-pv"><b>${esc(l.display)}</b> (리그 평균 ${esc(l.leagueDisplay)})</div></div>`;
    }).join("");
    const rows = r.lines.map(l => `<tr><td>${esc(l.label)} ${l.label !== l.en ? esc(l.en) : ""}</td><td>${esc(l.display)}</td><td>${esc(l.leagueDisplay)}</td>
      <td class="${l.tone === "even" ? "" : l.tone}">${l.value == null ? "-" : esc(l.diffDisplay)}</td>
      <td>${l.pct == null ? "-" : `${topText(l)}${l.rank ? `, ${l.rank}위` : ""}`}</td></tr>`).join("");
    const rawCols = rec.type === "batter"
      ? [["g", "경기"], ["pa", "타석"], ["ab", "타수"], ["h", "안타"], ["d2", "2루타"], ["d3", "3루타"], ["hr", "홈런"], ["rbi", "타점"], ["r", "득점"], ["bb", "볼넷"], ["hbp", "사구"], ["so", "삼진"], ["sf", "희생플라이"]]
      : [["g", "경기"], ["gs", "선발"], ["ip", "이닝"], ["h", "피안타"], ["hr", "피홈런"], ["bb", "볼넷"], ["so", "삼진"], ["er", "자책점"], ["r", "실점"], ["pitches", "투구 수"]];
    const raw = Object.assign({}, r.raw, { ip: ipText(r.raw.outs) });
    const rc = rawCols.filter(c => raw[c[0]] != null);   // 과거 시즌에 없는 열은 뺀다
    const rawTable = `<table><thead><tr>${rc.map(c => `<th>${c[1]}</th>`).join("")}</tr></thead><tbody><tr>${rc.map(c => `<td>${esc(raw[c[0]])}</td>`).join("")}</tr></tbody></table>`;
    const how = r.lines.map(l => `<li><b>${esc(l.label)}</b>: ${esc(l.how)}${l.better === "low" ? " (낮을수록 좋음)" : ""}</li>`).join("");
    const unq = r.qualified ? "" : `<li>이 선수는 규정(${esc(r.qualText)})을 채우지 못해 순위는 매기지 않고 백분위만 참고용으로 계산했습니다.</li>`;

    const p1 = `<h1 class="rp-title">${esc(rec.title)}</h1>
      <p class="rp-meta">${esc(teamName)} 소속, ${esc(s.pos)} 포지션, ${rec.season} 시즌. KBO ${rec.season} 정규시즌 실제 기록으로 분석했습니다.</p>
      <div class="rp-sec"><h2>핵심 요약</h2><div class="rp-kpis" style="--cols:${r.lines.length === 4 ? 4 : Math.min(r.lines.length, 3)}">${kpis}</div></div>
      <div class="rp-sec"><h2>리그 안에서의 위치</h2><div class="rp-pcts">${bars}
        <div class="rp-scale"><div></div><div><span>하위</span><span>평균</span><span>상위</span></div><div></div></div></div>
        <p class="rp-pv" style="margin-top:3mm">구슬 안 숫자는 백분위입니다. 91이면 규정을 채운 리그 ${r.noun || ty.noun} ${r.leagueN}명 중 91%보다 좋은 기록이라는 뜻입니다. 높을수록 좋은 성적이며, ERA처럼 낮을수록 좋은 지표는 방향을 뒤집어 계산했습니다.</p></div>
      <div class="rp-sec"><h2>해설</h2><div class="rp-callout">${esc(r.insight)}</div></div>`;
    const pSel = `<div class="rp-sec" style="margin-top:9mm"><h2>선택한 지표 상세</h2><table><thead><tr><th>지표</th><th>선수 기록</th><th>리그 평균</th><th>차이</th><th>리그 위치</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="rp-sec"><h2>기록 원자료</h2>${rawTable}</div>
      <div class="rp-sec"><h2>분석 방법과 유의사항</h2><ul class="rp-note">
        <li>리그 평균은 규정(${esc(r.qualText)})을 채운 ${r.noun || ty.noun} ${r.leagueN}명의 기록으로 계산했습니다. 타율 같은 비율 지표는 전체 합계로, 홈런 같은 횟수 지표는 1인당 평균으로 계산합니다.</li>
        ${unq}${d ? "" : how}
        ${(d ? d.notes.slice(1) : []).map(n => `<li>${esc(n)}</li>`).join("")}
        <li>분모가 0이어서 계산할 수 없는 값은 "-"로 표시했습니다.</li></ul></div>`;
    const ex = extraPages(extra, rec);   // AI 해설·예측이 있으면 쪽을 추가
    if (!d) return [p1, ...ex, pSel];
    const [d2, d3, d4, formula] = detailPages(rec, d);
    const cut = pSel.indexOf('<div class="rp-sec"><h2>분석 방법');   // 방법·유의사항은 여유 있는 3쪽으로, 계산식은 마지막 쪽으로
    return [p1, ...ex, d2, d3 + pSel.slice(cut), d4, pSel.slice(0, cut) + formula];

  }

  const topT = p => (p == null ? "-" : `상위 ${100 - p}%`);
  const MIXC = ["#1d3fbb", "#c8302a", "#17734f", "#98a3bd", "#c9892b", "#7a4fc2", "#2f9bb0", "#555"];

  // 상세 분석 보고서 부분 (결과 화면의 상세 보고서와 같은 내용을 인쇄용으로)
  function detailPages(rec, d) {
    const isBat = rec.type === "batter";
    const card = (title, cls, list) => `<div class="rp-card ${cls}"><h3>${title}</h3>${list.length ? list.map(i =>
      `<div class="it"><b>${esc(i.label)}</b> ${esc(i.display)} (리그 평균 ${esc(i.leagueDisplay)}, ${topT(i.pct)})<small>${esc(i.desc)}</small></div>`).join("") : '<div class="it">계산할 수 있는 지표가 없습니다.</div>'}</div>`;
    const prof = d.profile.filter(p => p.score != null).map(p => `<div class="rp-grp"><b>${esc(p.name)}<small>${esc(p.desc)}</small></b>
      <div class="rp-gb"><i class="${p.score >= 70 ? "hi" : p.score <= 30 ? "lo" : ""}" style="width:${p.score}%"></i></div><div class="rp-gv">${p.score}<small>${topT(p.score)}</small></div></div>`).join("");
    const c = d.composition;
    let comp;
    if (c.kind === "stack") {
      const col = ["#98a3bd", "#4a68d8", "#1d3fbb", "#c8302a"];
      const bar = (label, list) => `<div class="rp-stk"><b>${label}</b><div class="rp-sb">${list.map((x, i) => x.pct > 0 ? `<span style="width:${x.pct}%;background:${col[i]}">${x.pct >= 9 ? x.pct.toFixed(0) + "%" : ""}</span>` : "").join("")}</div></div>`;
      comp = bar("이 선수", c.player) + bar("리그", c.league) + `<div class="rp-leg">${c.player.map((x, i) => `<span><i style="background:${col[i]}"></i>${x.label} ${x.n}개</span>`).join("")}</div>`;
    } else {
      const max = Math.max(...c.player.map(x => x.v || 0), ...c.league.map(x => x.v || 0), 1);
      comp = c.player.map((x, i) => { const lg = c.league[i].v, good = i === 0 ? x.v > lg : x.v < lg;
        return `<div class="rp-tbar ${good ? "best" : ""}"><b>${x.label}</b><div class="rp-tt"><span class="rp-tf" style="width:${(x.v || 0) / max * 100}%"></span><span class="rp-tavg" style="left:${(lg || 0) / max * 100}%"></span></div><span class="rp-tv">${x.v == null ? "-" : x.v.toFixed(1)}</span></div>`; }).join("") + '<p class="rp-pv">빨간 세로선은 리그 평균입니다.</p>';
    }
    const p2 = `<div class="rp-sec" style="margin-top:9mm"><h2>종합 평가</h2><p class="rp-head">${d.headline}</p>
        <div class="rp-two">${card("강점", "pos", d.strengths)}${card("보완할 점", "neg", d.weaknesses)}</div></div>
      <div class="rp-sec"><h2>능력 프로필</h2><p class="rp-pv" style="margin-bottom:2mm">영역별 지표의 리그 백분위 평균입니다. 높을수록 리그에서 앞선 영역입니다.</p>${prof}</div>
      <div class="rp-sec"><h2>${esc(c.title)}</h2><p class="rp-pv">${esc(c.note)}</p>${comp}</div>`;

    const groups = [...new Set(d.items.map(i => i.group))];
    const trs = groups.map(g => `<tr class="gh"><td colspan="6">${esc(g)}</td></tr>` + d.items.filter(i => i.group === g).map(i =>
      `<tr><td>${esc(i.label)} <span style="color:#5c667d;font-size:8pt">${esc(i.en)}</span></td><td>${esc(i.display)}</td><td>${esc(i.leagueDisplay)}</td>
       <td class="${i.tone === "even" || i.value == null ? "" : i.tone}">${i.value == null ? "-" : esc(i.diffDisplay)}</td>
       <td>${i.pct == null ? "-" : `<div class="rp-mpw"><div class="rp-mp"><div style="width:${i.pct}%"></div></div><b>${i.pct}</b></div>`}</td><td>${i.rank ? i.rank + "위" : "-"}</td></tr>`).join("")).join("");
    const p3 = `<div class="rp-sec" style="margin-top:9mm"><h2>전체 지표</h2><p class="rp-pv" style="margin-bottom:2mm">${isBat ? "타자" : "투수"}에게 필요한 지표 ${d.items.length}개를 영역별로 정리했습니다. 분석에서 고른 지표만이 아니라 전부 계산했습니다.</p>
      <table class="rp-sm"><thead><tr><th>지표</th><th>선수 기록</th><th>리그 평균</th><th>차이</th><th>백분위</th><th>순위</th></tr></thead><tbody>${trs}</tbody></table></div>`;
    const formula = `<div class="rp-sec"><h2>지표 설명과 계산식</h2><table class="rp-sm"><tbody>${d.items.map(i => `<tr><td style="white-space:nowrap">${esc(i.label)}</td><td style="text-align:left;color:#2b3550">${esc(i.how)}</td></tr>`).join("")}</tbody></table></div>`;

    let p4 = "";
    if (d.trend) {
      p4 += `<div class="rp-sec" style="margin-top:9mm"><h2>월별 추이</h2><p class="rp-pv" style="margin-bottom:2mm">표본이 충분한 달(${isBat ? "50타석" : "10이닝"} 이상) 중 가장 좋은 달은 초록색, 가장 나쁜 달은 빨간색입니다.</p>
        <table class="rp-sm"><thead><tr><th>지표</th>${d.trend.months.map(m => `<th>${m.label}<br><span style="font-size:7pt">${m.size}</span></th>`).join("")}</tr></thead><tbody>${d.trend.rows.map(r =>
          `<tr><td>${esc(r.label)}</td>${r.cells.map(x => `<td class="${x.tone}">${esc(x.display)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    }
    if (d.pitchMix) {
      p4 += `<div class="rp-sec"><h2>구종 구성</h2><div class="rp-stk"><b>구종</b><div class="rp-sb">${d.pitchMix.map((m, i) => `<span style="width:${m.pct}%;background:${MIXC[i % 8]}">${m.pct >= 9 ? esc(m.pitch) + " " + m.pct.toFixed(0) + "%" : ""}</span>`).join("")}</div></div>
        <table class="rp-sm" style="margin-top:3mm"><thead><tr><th>구종</th><th>투구 수</th><th>비율</th><th>평균 구속</th></tr></thead><tbody>${d.pitchMix.map((m, i) =>
          `<tr><td><i style="display:inline-block;width:2.2mm;height:2.2mm;background:${MIXC[i % 8]};margin-right:2mm"></i>${esc(m.pitch)}</td><td>${m.n}</td><td>${m.pct.toFixed(1)}%</td><td>${m.kmh.toFixed(1)}km/h</td></tr>`).join("")}</tbody></table></div>`;
    }
    if (d.similar.length) {
      p4 += `<div class="rp-sec"><h2>${esc(d.similarTitle || (isBat ? "비슷한 유형의 타자" : "비슷한 유형의 투수"))}</h2><p class="rp-pv" style="margin-bottom:2mm">주요 지표의 리그 위치가 가장 비슷한 선수입니다. 100에 가까울수록 닮았습니다.</p>
        <div class="rp-sim">${d.similar.map(x => `<div><b>${esc(x.name)}</b>${esc(x.team)} · ${esc(x.pos)}<br><em>비슷한 정도 ${x.similarity}</em><small>${esc(x.key)}</small></div>`).join("")}</div></div>`;
    }
    return [p2, p3, p4, formula];
  }

  function ipText(outs) { if (outs == null) return "-"; const w = Math.floor(outs / 3), r = outs % 3; return r ? `${w} ${r}/3` : String(w); }

  // 선수 비교 PDF(2~4명): 요약·영역 막대·나이별 커리어 / 지표별 표 / 예측 비교
  function comparePages(rec) {
    const r = rec.result, c = r.cmp, ch = r.charts || {}, col = ch.colors || ["#5e6ad2", "#d0312d", "#17734f", "#c9892b"], n = c.names.length;
    const leg = `<div class="rp-leg2">${c.names.map((nm, i) => `<span><i style="border-color:${col[i]}"></i>${esc(nm)}</span>`).join("")}</div>`;
    const bars = c.profile.map(g => `<div class="rp-cbar"><b>${esc(g.name)}</b>${g.scores.map((s, i) => `<div class="rp-crow"><div class="rp-ct"><i style="width:${s}%;background:${col[i]}"></i></div><span>${s}</span></div>`).join("")}</div>`).join("");
    const groups = [...new Set(c.items.map(i => i.group))];
    const trs = groups.map(g => `<tr class="gh"><td colspan="${n + 1}">${esc(g)}</td></tr>` + c.items.filter(i => i.group === g).map(it =>
      `<tr><td>${esc(it.label)}${it.label !== it.en ? ` <span style="color:#5c667d;font-size:7pt">${esc(it.en)}</span>` : ""}</td>${it.vals.map((v, i) => `<td class="${it.lead === i ? "ld" : ""}" style="${it.lead === i ? `color:${col[i]}` : ""}">${esc(v.display)}${v.pct == null ? "" : `<small>상위 ${100 - v.pct}%</small>`}</td>`).join("")}</tr>`).join("")).join("");
    const p1 = `<h1 class="rp-title">${esc(rec.title)}</h1>
      <p class="rp-meta">${[...new Set(r.seasons || [rec.season])].join(", ")} 시즌, 같은 종류 선수 ${n}명을 각자 그 시즌 리그 안에서의 백분위로 비교했습니다.</p>
      <div class="rp-sec"><h2>한눈에 보기</h2><div class="rp-callout">${esc(c.summary)}</div></div>
      <div class="rp-sec"><h2>영역별 비교</h2><p class="rp-pv" style="margin-bottom:1.5mm">영역별 리그 백분위 평균입니다(높을수록 좋음).</p>${leg}${bars}</div>
      ${ch.age ? `<div class="rp-sec"><h2>나이별 커리어 비교 (${esc(c.unit)})</h2>${leg}${chartBox(ch.age)}</div>` : ""}`;
    const p2 = `<div class="rp-sec" style="margin-top:9mm"><h2>지표별 비교</h2><table class="rp-sm rp-cmpt"><thead><tr><th>지표</th>${c.names.map((nm, i) => `<th style="color:${col[i]}">${esc(nm)}</th>`).join("")}</tr></thead><tbody>${trs}</tbody></table>
      <p class="rp-fine">굵은 색 글씨는 리그 백분위가 두 번째로 좋은 선수보다 8점 이상 앞선 선수입니다. 순위와 백분위는 각자 같은 종류의 규정 충족 선수 기준입니다.</p></div>`;
    const fcs = ch.fcs, d = ch.digits;
    const p3 = ch.fut ? `<div class="rp-sec" style="margin-top:9mm"><h2>앞으로 5년 예측 비교 (실험적 기능)</h2><p class="rp-pv" style="margin-bottom:2mm">선은 예측값, 옅은 띠는 실제 값이 들어올 가능성이 80%인 범위입니다.</p>${leg}${chartBox(ch.fut)}
      <table class="rp-sm" style="margin-top:2.5mm"><thead><tr><th>시즌</th>${c.names.map(nm => `<th>${esc(nm)}</th>`).join("")}</tr></thead><tbody>${fcs[0].pred.map((q, k) => `<tr><td>${q.year}</td>${fcs.map(f => { const x = f.pred[k]; return `<td>${x.mid.toFixed(d)} (${x.lo.toFixed(d)}~${x.hi.toFixed(d)}, 현역 ${Math.round(x.active * 100)}%)</td>`; }).join("")}</tr>`).join("")}</tbody></table>
      <p class="rp-fine">은퇴 시기 예측: ${c.names.map((nm, i) => `${esc(nm)} ${fcs[i].retire_by ? fcs[i].retire_by + "세" : "5년 안에는 높게 유지"}`).join(", ")}. 정확도와 한계는 선수별 분석 결과 화면에 있습니다. 학습 데이터: Kaggle KBO Player Stats 1982–2026 (netsong, CC BY-NC-SA 4.0).</p></div>` : "";
    return [p1, p2, p3].filter(Boolean);
  }

  // 팀 AI 해설 + 승률 추이·예측 (있는 것만 쪽으로 만든다)
  function teamExtra(rec, extra) {
    if (!extra) return [];
    const { tf, tc } = extra, teams = rec.result.teams, ids = teams.map(t => t.id), names = Object.fromEntries(teams.map(t => [t.id, t.name]));
    const cards = ids.filter(id => tc && tc[`${rec.season}-${id}`]);
    const hasF = tf && rec.season === tf.meta.base_season && ids.some(id => tf.teams[id]);
    const out = [];
    if (cards.length) {
      const ul = a => (a && a.length ? `<ul>${a.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : "");
      out.push(`<div class="rp-sec"><h2>팀 AI 해설</h2><div class="rp-two2">${cards.map(id => { const c = tc[`${rec.season}-${id}`];
        return `<div><h3>${esc(names[id])}</h3><p>${esc(c.summary)}</p>${ul(c.strengths)}${ul(c.watch)}${c.outlook ? `<p style="margin-top:1mm;color:#5c667d">${esc(c.outlook)}</p>` : ""}</div>`; }).join("")}</div>
        <p class="rp-fine">AI가 이 보고서의 계산 수치만 바탕으로 미리 작성한 설명입니다. 해석은 참고용입니다.</p></div>`);
    }
    if (hasF) {
      const g = teamPlot(ids, names, tf, { W: 600, H: 190, L: 44, R: 10, T: 10, B: 8 }), v = tf.meta.validation;
      const trs = ids.map(id => { const t = tf.teams[id]; return `<tr><td>${esc(names[id])}</td><td>${t ? `${wpText(t.now.wp)} (${t.now.w}승 ${t.now.l}패)` : "-"}</td>${tf.meta.horizons.map(h => { const q = t && t.pred.find(x => x.h === h); return `<td>${q ? `${wpText(q.wp)} (${wpText(q.lo)}~${wpText(q.hi)}, 약 ${q.wins}승)` : "-"}</td>`; }).join("")}</tr>`; }).join("");
      const sums = ids.map(id => [id, teamSummary(tf, id)]).filter(x => x[1]);
      const sumTable = sums.length ? `<table class="rp-sm" style="margin-top:2.5mm"><thead><tr><th>팀 역대</th><th>통산 승-패</th><th>통산 승률</th><th>최고 시즌</th><th>최저 시즌</th><th>승률 1위</th><th>5위 이내</th></tr></thead><tbody>${sums.map(([id, s]) => `<tr><td>${esc(names[id])}</td><td>${s.w}-${s.l}</td><td>${wpText(s.wp)}</td><td>${s.best[0]}년 ${wpText(s.best[5])}</td><td>${s.worst[0]}년 ${wpText(s.worst[5])}</td><td>${s.first}회</td><td>${s.top5}/${s.seasons}</td></tr>`).join("")}</tbody></table>` : "";
      const notes = tf.meta.horizons.map(h => { const x = v[h], pick = x.mae[x.chosen]; return `<li>${h}년 뒤: 시험(2019~${tf.meta.base_season}) 평균 오차 ${pick.test.toFixed(3)}, 작년 승률을 그대로 쓰는 방법 ${x.mae.last.test.toFixed(3)}. 방법은 ${esc(TEAM_METHOD[x.chosen] || x.chosen)}, 80% 범위 적중률 ${Math.round(x.coverage80 * 100)}%.</li>`; }).join("");
      out.push(`<div class="rp-sec"><h2>팀 승률 추이와 예측 (실험적 기능)</h2>
        <p class="rp-pv" style="margin-bottom:2mm">2005년 이후 시즌별 승률(실선)과 앞으로 ${tf.meta.horizons.length}년 예측(점선)입니다. 승률 .500은 승과 패가 같다는 뜻입니다.</p>
        <div class="rp-leg2">${ids.map((id, i) => `<span><i style="border-color:${TEAM_COLORS[i % 4]}"></i>${esc(names[id])}</span>`).join("")}</div>
        ${chartBox(g)}
        <table class="rp-sm" style="margin-top:2.5mm"><thead><tr><th>팀</th><th>${tf.meta.base_season} (올해)</th>${tf.meta.horizons.map(h => `<th>${tf.meta.base_season + h} 예측</th>`).join("")}</tr></thead><tbody>${trs}</tbody></table>${sumTable}
        <ul class="rp-note" style="margin-top:2mm">${notes}<li>팀 성적은 선수 이동·부상 같은 변화가 커서 먼 미래일수록 평균(.500)에 가까워지며, 시험 표본(팀·시즌 80개)이 작아 참고용입니다. 예상 승수는 승률 × 144입니다.</li></ul>
        <p class="rp-fine">학습 데이터: Kaggle KBO Player Stats 1982–2026 (netsong, CC BY-NC-SA 4.0)을 팀·시즌별로 합산. 구단 이름이 바뀐 팀은 이어서 계산했습니다.</p></div>`);
    }
    return out.map(b => `<div style="margin-top:9mm">${b}</div>`);
  }

  function teamPages(rec, extra) {
    const r = rec.result;
    const head = r.metrics.map(m => `<th>${esc(m.label)}</th>`).join("");
    const body = r.teams.map(t => `<tr><td>${esc(t.name)}</td>${r.metrics.map(m => { const it = m.items.find(x => x.id === t.id); return `<td class="${m.bestId === t.id ? "good" : ""}">${esc(it.display)}</td>`; }).join("")}</tr>`).join("");
    const lg = `<tr class="lg"><td>리그 평균</td>${r.metrics.map(m => `<td>${esc(m.leagueDisplay)}</td>`).join("")}</tr>`;
    const best = r.metrics.map(m => `<li><b>${esc(m.label)}</b>: ${esc(m.bestName)} ${esc(m.bestDisplay)}${m.better === "low" ? " (낮을수록 좋음)" : ""}</li>`).join("");
    const how = r.metrics.map(m => `<li><b>${esc(m.label)}</b>: ${esc(m.how)}</li>`).join("");
    const p1 = `<h1 class="rp-title">${esc(rec.title)}</h1>
      <p class="rp-meta">${r.teams.map(t => esc(t.name)).join(", ")}. KBO ${rec.season} 정규시즌 실제 기록으로 분석했습니다.</p>
      <div class="rp-sec"><h2>팀별 기록 요약</h2><table><thead><tr><th>팀</th>${head}</tr></thead><tbody>${body}${lg}</tbody></table>
        <p class="rp-pv" style="margin-top:2.5mm">초록색 굵은 글씨는 선택한 팀 중 가장 좋은 기록입니다.</p></div>
      <div class="rp-sec"><h2>지표별 1위</h2><ul>${best}</ul></div>
      <div class="rp-sec"><h2>해설</h2><div class="rp-callout">${esc(r.insight)}</div></div>`;
    const blocks = r.metrics.map(m => {
      const vals = m.items.map(i => i.value).concat([m.league]);
      const max = Math.max(...vals.map(Math.abs), 1);
      const rows = m.items.map(it => {
        const w = m.diverge ? Math.abs(it.value) / max * 50 : it.value / max * 100;
        const style = m.diverge ? (it.value >= 0 ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`) : `width:${w}%`;
        const avgLeft = m.diverge ? 50 + m.league / max * 50 : m.league / max * 100;
        return `<div class="rp-tbar ${m.bestId === it.id ? "best" : ""}"><b>${esc(it.name)}</b><div class="rp-tt">${m.diverge ? '<span class="rp-tzero"></span>' : ""}<span class="rp-tf" style="${style}"></span><span class="rp-tavg" style="left:${avgLeft}%"></span></div><span class="rp-tv">${esc(it.display)}</span></div>`;
      }).join("");
      return `<div class="rp-tm"><h3>${esc(m.label)}${m.better === "low" ? " (낮을수록 좋음)" : ""}, 리그 평균 ${esc(m.leagueDisplay)}</h3>${rows}</div>`;
    }).join("");
    const p2 = `<div class="rp-sec" style="margin-top:9mm"><h2>지표별 비교</h2>${blocks}<p class="rp-pv">빨간 세로선은 리그 평균입니다. 파란 막대가 가장 좋은 기록입니다.</p></div>
      <div class="rp-sec"><h2>분석 방법과 유의사항</h2><ul><li>리그 평균은 리그 ${r.leagueN}개 팀 전체의 평균입니다.</li>${how}</ul></div>`;
    return [p1, ...teamExtra(rec, extra), p2];
  }

  function html(rec, d, extra) {
    d = d || rec.result.report;
    const parts = rec.result.kind === "compare" ? comparePages(rec) : rec.result.kind === "team" ? teamPages(rec, extra) : playerPages(rec, d, extra);
    return `<div class="rp"><style>${CSS}</style>${parts.map((p, i) => pageWrap(p, i + 1, parts.length, rec)).join("")}</div>`;
  }

  function fileName(rec) {
    if (rec.result.kind === "compare") return `선수비교_${rec.result.names.join("_")}_${dateIso(rec.createdAt)}.pdf`.replace(/[\\/:*?"<>|\s]+/g, "_");
    const ty = T()[rec.type];
    const who = rec.result.kind === "team" ? `${rec.result.teams.length}개팀` : rec.result.subject.name;
    return `${ty.label.replace(/\s/g, "")}_${who}_${dateIso(rec.createdAt)}.pdf`.replace(/[\\/:*?"<>|\s]+/g, "_");
  }

  // 상세 보고서가 저장돼 있지 않은 예전 기록이면 지금 만든다
  async function reportFor(rec) {
    if (rec.result.kind === "team" || rec.result.kind === "compare") return null;
    if (rec.result.report) return rec.result.report;
    try {
      const meta = await Api.meta();
      const rows = await (rec.type === "batter" ? Api.batters(rec.season) : Api.pitchers(rec.season));
      const monthly = await Api.monthly(rec.type, rec.params.target, rec.season);
      const mix = rec.type === "pitcher" ? await Api.pitchmix(rec.params.target, rec.season) : null;
      return build(rec.type, rows, rec.params.target, qualFor(meta, rec.season), meta, monthly, mix);
    } catch (e) { return null; }
  }

  // PDF에 넣을 AI 해설·예측 (파일이 없거나 해당 선수 항목이 없으면 그 부분만 빠진다)
  async function extraFor(rec) {
    if (rec.result.kind === "compare") return null;
    try {
      if (rec.result.kind === "team") { const [tf, tc] = await Promise.all([Api.teamForecast(), Api.teamCommentary()]); return { tf, tc }; }
      const [all, fc, career, fx] = await Promise.all([Api.commentary(), Api.forecast(), Api.career(), Api.forecastExtra()]);
      return { ai: (all || {})[`${rec.season}-${rec.params.target}`] || null, fc, career, fx };
    } catch (e) { return null; }
  }

  // output: "save" (파일 내려받기) | "datauristring" (확인용)
  async function generate(rec, output) {
    let html2pdf;
    try { html2pdf = (await import("html2pdf.js")).default; } catch (e) { throw new Error("PDF 도구를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 눌러 주세요."); }
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:-10000px;top:0;width:210mm;";
    host.innerHTML = html(rec, await reportFor(rec), await extraFor(rec));
    document.body.appendChild(host);
    // 화면이 스크롤된 채로 찍으면 스크롤한 만큼 내용이 밀려 PDF가 깨진다. 찍는 동안만 맨 위로 되돌린다.
    const sx = window.pageXOffset, sy = window.pageYOffset;
    window.scrollTo(0, 0);
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      paginate(host);   // 한 쪽에 안 들어가는 블록은 다음 쪽으로
      const worker = html2pdf().set({
        margin: 0, filename: fileName(rec), image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", windowWidth: 794, scrollX: 0, scrollY: 0, x: 0, y: 0 },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css"] },
      }).from(host.firstElementChild);
      return output === "save" ? await worker.save() : await worker.outputPdf(output);
    } finally { host.remove(); window.scrollTo(sx, sy); }
  }

export { html, fileName, generate, ipText };
