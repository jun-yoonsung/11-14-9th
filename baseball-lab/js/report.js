/* PDF 보고서: 결과 화면과 별도로 A4 인쇄물 형태로 디자인하고 html2pdf.js로 파일로 내려받는다 */
(function () {
  "use strict";
  const esc = BL.esc;
  const T = () => Stats.TYPES;

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
  `;

  const kpiTone = l => (l.value == null ? "" : l.tone);
  const kpiNote = l => (l.value == null ? "기록 없음" : l.tone === "even" ? "리그 평균과 같음" : `리그보다 ${l.diffDisplay}`);
  const pageWrap = (inner, n, total, rec) => `<section class="rp-page">
    <div class="rp-top"><b>야구 분석 랩</b><span>분석 보고서, ${esc(View.dateKo(rec.createdAt))}</span></div>
    ${inner}
    <div class="rp-foot"><span>화면과 보고서의 선수와 팀 기록은 KBO 2026 정규시즌 경기 기록을 집계한 값입니다.</span><span>${n} / ${total}</span></div></section>`;

  function playerPages(rec) {
    const r = rec.result, ty = T()[rec.type], s = r.subject;
    const teamName = r.teamName || s.team;
    const kpis = r.lines.map(l => `<div class="rp-kpi"><small>${esc(l.label)}${l.label !== l.en ? " " + esc(l.en) : ""}</small><strong>${esc(l.display)}</strong><em class="${kpiTone(l)}">${esc(kpiNote(l))}</em></div>`).join("");
    const bars = r.lines.map(l => {
      const head = `<b>${esc(l.label)}${l.label !== l.en ? `<small>${esc(l.en)}</small>` : ""}</b>`;
      if (l.pct == null) return `<div class="rp-pct">${head}<div class="rp-pv">기록이 없어 위치를 표시하지 않습니다.</div><div class="rp-pv"><b>-</b></div></div>`;
      return `<div class="rp-pct">${head}<div class="rp-track"><span class="rp-bead" style="left:clamp(0%,${l.pct}%,100%);background:${View.beadColor(l.pct)}">${l.pct}</span></div><div class="rp-pv"><b>${esc(l.display)}</b> (리그 평균 ${esc(l.leagueDisplay)})</div></div>`;
    }).join("");
    const rows = r.lines.map(l => `<tr><td>${esc(l.label)} ${l.label !== l.en ? esc(l.en) : ""}</td><td>${esc(l.display)}</td><td>${esc(l.leagueDisplay)}</td>
      <td class="${l.tone === "even" ? "" : l.tone}">${l.value == null ? "-" : esc(l.diffDisplay)}</td>
      <td>${l.pct == null ? "-" : `${View.topText(l)}${l.rank ? `, ${l.rank}위` : ""}`}</td></tr>`).join("");
    const rawCols = rec.type === "batter"
      ? [["g", "경기"], ["pa", "타석"], ["ab", "타수"], ["h", "안타"], ["d2", "2루타"], ["d3", "3루타"], ["hr", "홈런"], ["rbi", "타점"], ["r", "득점"], ["bb", "볼넷"], ["hbp", "사구"], ["so", "삼진"], ["sf", "희생플라이"]]
      : [["g", "경기"], ["gs", "선발"], ["ip", "이닝"], ["h", "피안타"], ["hr", "피홈런"], ["bb", "볼넷"], ["so", "삼진"], ["er", "자책점"], ["r", "실점"], ["pitches", "투구 수"]];
    const raw = Object.assign({}, r.raw, { ip: ipText(r.raw.outs) });
    const rawTable = `<table><thead><tr>${rawCols.map(c => `<th>${c[1]}</th>`).join("")}</tr></thead><tbody><tr>${rawCols.map(c => `<td>${esc(raw[c[0]])}</td>`).join("")}</tr></tbody></table>`;
    const how = r.lines.map(l => `<li><b>${esc(l.label)}</b>: ${esc(l.how)}${l.better === "low" ? " (낮을수록 좋음)" : ""}</li>`).join("");
    const unq = r.qualified ? "" : `<li>이 선수는 규정(${esc(r.qualText)})을 채우지 못해 순위는 매기지 않고 백분위만 참고용으로 계산했습니다.</li>`;

    const p1 = `<h1 class="rp-title">${esc(rec.title)}</h1>
      <p class="rp-meta">${esc(teamName)} 소속, ${esc(s.pos)} 포지션, ${rec.season} 시즌. KBO 2026 정규시즌 실제 기록으로 분석했습니다.</p>
      <div class="rp-sec"><h2>핵심 요약</h2><div class="rp-kpis" style="--cols:${r.lines.length === 4 ? 4 : Math.min(r.lines.length, 3)}">${kpis}</div></div>
      <div class="rp-sec"><h2>리그 안에서의 위치</h2><div class="rp-pcts">${bars}
        <div class="rp-scale"><div></div><div><span>하위</span><span>평균</span><span>상위</span></div><div></div></div></div>
        <p class="rp-pv" style="margin-top:3mm">구슬 안 숫자는 백분위입니다. 91이면 규정을 채운 리그 ${ty.noun} ${r.leagueN}명 중 91%보다 좋은 기록이라는 뜻입니다. 높을수록 좋은 성적이며, ERA처럼 낮을수록 좋은 지표는 방향을 뒤집어 계산했습니다.</p></div>
      <div class="rp-sec"><h2>해설</h2><div class="rp-callout">${esc(r.insight)}</div></div>`;
    const p2 = `<div class="rp-sec" style="margin-top:9mm"><h2>지표별 상세</h2><table><thead><tr><th>지표</th><th>선수 기록</th><th>리그 평균</th><th>차이</th><th>리그 위치</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="rp-sec"><h2>기록 원자료</h2>${rawTable}</div>
      <div class="rp-sec"><h2>분석 방법과 유의사항</h2><ul>
        <li>리그 평균은 규정(${esc(r.qualText)})을 채운 ${ty.noun} ${r.leagueN}명의 기록으로 계산했습니다. 타율 같은 비율 지표는 전체 합계로, 홈런 같은 횟수 지표는 1인당 평균으로 계산합니다.</li>
        ${unq}${how}
        <li>분모가 0이어서 계산할 수 없는 값은 "-"로 표시했습니다.</li></ul></div>`;
    return [p1, p2];
  }

  function ipText(outs) { if (outs == null) return "-"; const w = Math.floor(outs / 3), r = outs % 3; return r ? `${w} ${r}/3` : String(w); }

  function teamPages(rec) {
    const r = rec.result;
    const head = r.metrics.map(m => `<th>${esc(m.label)}</th>`).join("");
    const body = r.teams.map(t => `<tr><td>${esc(t.name)}</td>${r.metrics.map(m => { const it = m.items.find(x => x.id === t.id); return `<td class="${m.bestId === t.id ? "good" : ""}">${esc(it.display)}</td>`; }).join("")}</tr>`).join("");
    const lg = `<tr class="lg"><td>리그 평균</td>${r.metrics.map(m => `<td>${esc(m.leagueDisplay)}</td>`).join("")}</tr>`;
    const best = r.metrics.map(m => `<li><b>${esc(m.label)}</b>: ${esc(m.bestName)} ${esc(m.bestDisplay)}${m.better === "low" ? " (낮을수록 좋음)" : ""}</li>`).join("");
    const how = r.metrics.map(m => `<li><b>${esc(m.label)}</b>: ${esc(m.how)}</li>`).join("");
    const p1 = `<h1 class="rp-title">${esc(rec.title)}</h1>
      <p class="rp-meta">${r.teams.map(t => esc(t.name)).join(", ")}. KBO 2026 정규시즌 실제 기록으로 분석했습니다.</p>
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
    return [p1, p2];
  }

  function html(rec) {
    const parts = rec.result.kind === "team" ? teamPages(rec) : playerPages(rec);
    return `<div class="rp"><style>${CSS}</style>${parts.map((p, i) => pageWrap(p, i + 1, parts.length, rec)).join("")}</div>`;
  }

  function fileName(rec) {
    const ty = T()[rec.type];
    const who = rec.result.kind === "team" ? `${rec.result.teams.length}개팀` : rec.result.subject.name;
    return `${ty.label.replace(/\s/g, "")}_${who}_${View.dateIso(rec.createdAt)}.pdf`.replace(/[\\/:*?"<>|\s]+/g, "_");
  }

  // output: "save" (파일 내려받기) | "datauristring" (확인용)
  async function generate(rec, output) {
    if (!window.html2pdf) throw new Error("PDF 도구를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 눌러 주세요.");
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:-10000px;top:0;width:210mm;";
    host.innerHTML = html(rec);
    document.body.appendChild(host);
    // 화면이 스크롤된 채로 찍으면 스크롤한 만큼 내용이 밀려 PDF가 깨진다. 찍는 동안만 맨 위로 되돌린다.
    const sx = window.pageXOffset, sy = window.pageYOffset;
    window.scrollTo(0, 0);
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const worker = window.html2pdf().set({
        margin: 0, filename: fileName(rec), image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", windowWidth: 794, scrollX: 0, scrollY: 0, x: 0, y: 0 },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css"] },
      }).from(host.firstElementChild);
      return output === "save" ? await worker.save() : await worker.outputPdf(output);
    } finally { host.remove(); window.scrollTo(sx, sy); }
  }

  window.Report = { html, fileName, generate, ipText };
})();
