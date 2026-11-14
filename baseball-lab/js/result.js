/* 분석 결과: 저장된 결과 요약으로 그린다 (분석 당시와 같은 값이 나오게 하려고 다시 계산하지 않는다) */
(function () {
  "use strict";
  if (!BL.Auth.require()) return;
  BL.renderShell("analyze");
  const { Store, esc, toast } = BL;
  const view = document.getElementById("view");

  const id = new URLSearchParams(location.search).get("id");
  const rec = id ? Store.get(id) : null;
  if (!rec) {
    view.innerHTML = `<div class="err-box" role="alert"><b>이 분석 결과를 찾을 수 없습니다.</b><br />삭제되었거나 다른 브라우저에서 만든 분석일 수 있어요.</div>
      <div class="act-row"><a class="btn" href="history.html">분석 기록 보기</a><a class="btn pri" href="analyze.html">새 분석 시작하기</a></div>`;
    return;
  }
  document.title = rec.title + " | 야구 분석 랩";
  const r = rec.result;
  const TY = Stats.TYPES[rec.type];

  const kpiNote = l => (l.value == null ? "기록 없음" : l.tone === "even" ? "리그 평균과 같음" : `리그보다 ${l.diffDisplay}`);

  function playerView() {
    const kpis = r.lines.map(l => `<div class="kpi"><small>${esc(l.label)}${l.label !== l.en ? " " + esc(l.en) : ""}</small><strong>${esc(l.display)}</strong><em class="${l.value == null ? "" : l.tone}">${esc(kpiNote(l))}</em></div>`).join("");
    const rows = r.lines.map(l => `<tr><td>${esc(l.label)}${l.label !== l.en ? " " + esc(l.en) : ""}</td><td>${esc(l.display)}</td><td>${esc(l.leagueDisplay)}</td>
      <td class="${l.tone === "even" || l.value == null ? "" : l.tone}">${l.value == null ? "-" : esc(l.diffDisplay)}</td>
      <td>${l.pct == null ? "-" : `${View.topText(l)}${l.rank ? `, ${l.rank}위` : ""}`}</td></tr>`).join("");
    const rawCols = rec.type === "batter"
      ? [["g", "경기"], ["ab", "타수"], ["h", "안타"], ["d2", "2루타"], ["d3", "3루타"], ["hr", "홈런"], ["rbi", "타점"], ["bb", "볼넷"], ["hbp", "사구"], ["so", "삼진"], ["sf", "희생플라이"], ["sb", "도루"]]
      : [["g", "경기"], ["ip", "이닝"], ["h", "피안타"], ["hr", "피홈런"], ["bb", "볼넷"], ["so", "삼진"], ["er", "자책점"], ["w", "승"], ["l", "패"], ["sv", "세이브"]];
    const raw = Object.assign({}, r.raw, { ip: Report.ipText(r.raw.outs) });
    const unq = r.qualified ? "" : `<p class="note">이 선수는 규정(${esc(r.qualText)})을 채우지 못해 순위는 매기지 않고 백분위만 참고용으로 보여 줍니다.</p>`;
    return `<div class="kpis">${kpis}</div>
      <section class="sec"><div class="board"><h2>리그 안에서의 위치</h2>
        ${r.lines.some(l => l.pct != null) ? `<p class="sub">구슬 안 숫자는 백분위예요. 91이면 규정을 채운 리그 ${TY.noun} ${r.leagueN}명 중 91%보다 좋은 기록이라는 뜻입니다. 높을수록 좋은 성적이고, ERA처럼 낮을수록 좋은 지표도 같은 방향으로 맞췄어요.</p>` : ""}
        ${View.pctBlock(r.lines)}
        <div class="insight">${esc(r.insight)}</div>${unq}</div></section>
      <div id="repBox"></div>
      <section class="sec"><h2>선택한 지표 상세</h2>
        <div class="table-wrap"><table><thead><tr><th>지표</th><th>선수 기록</th><th>리그 평균</th><th>차이</th><th>리그 위치</th></tr></thead><tbody>${rows}</tbody></table></div></section>
      <section class="sec"><h2>기록 원자료</h2>
        <div class="table-wrap"><table><thead><tr>${rawCols.map(c => `<th>${c[1]}</th>`).join("")}</tr></thead><tbody><tr>${rawCols.map(c => `<td>${esc(raw[c[0]])}</td>`).join("")}</tr></tbody></table></div></section>`;
  }

  function teamView() {
    const head = r.metrics.map(m => `<th>${esc(m.label)}</th>`).join("");
    const body = r.teams.map(t => `<tr><td>${esc(t.name)}</td>${r.metrics.map(m => { const it = m.items.find(x => x.id === t.id); return `<td class="${m.bestId === t.id ? "good" : ""}">${esc(it.display)}</td>`; }).join("")}</tr>`).join("");
    const blocks = r.metrics.map(m => {
      const max = Math.max(...m.items.map(i => Math.abs(i.value)).concat([Math.abs(m.league)]), 1);
      const rows = m.items.map(it => {
        const wd = m.diverge ? Math.abs(it.value) / max * 50 : it.value / max * 100;
        const style = m.diverge ? (it.value >= 0 ? `left:50%;width:${wd}%` : `left:${50 - wd}%;width:${wd}%`) : `width:${wd}%`;
        const avg = m.diverge ? 50 + m.league / max * 50 : m.league / max * 100;
        return `<div class="tbar ${m.bestId === it.id ? "best" : ""}"><b>${esc(it.name)}</b><div class="tbar-track">${m.diverge ? '<span class="tbar-zero"></span>' : ""}<span class="tbar-fill" style="${style}"></span><span class="tbar-avg" style="left:${avg}%"></span></div><span class="v">${esc(it.display)}</span></div>`;
      }).join("");
      return `<div class="team-metric"><h3>${esc(m.label)}${m.better === "low" ? " (낮을수록 좋음)" : ""}, 리그 평균 ${esc(m.leagueDisplay)}</h3>${rows}</div>`;
    }).join("");
    return `<section class="sec" style="margin-top:0"><h2>팀별 기록 요약</h2>
        <div class="table-wrap"><table><thead><tr><th>팀</th>${head}</tr></thead><tbody>${body}</tbody></table></div>
        <p class="note">초록색 굵은 글씨는 선택한 팀 중 가장 좋은 기록입니다.</p>
        <div class="insight">${esc(r.insight)}</div></section>
      <section class="sec"><h2>지표별 비교</h2>${blocks}
        <p class="legend"><i style="background:#1d3fbb"></i>가장 좋은 기록 <i style="background:#8d9ab8;margin-left:12px"></i>그 밖의 팀 <i style="background:#c8302a;margin-left:12px;width:3px"></i>리그 평균</p></section>`;
  }

  const sub = r.kind === "team"
    ? `${rec.season} 시즌, ${r.teams.map(t => esc(t.name)).join(", ")}`
    : `${rec.season} 시즌, ${esc(r.teamName || r.subject.team)} 소속, ${esc(r.subject.pos)} 포지션`;

  view.innerHTML = `
    <div class="result-head">
      <h1>${esc(rec.title)}</h1>
      <p class="sub">${sub}. ${esc(View.dateKo(rec.createdAt))} 분석, 사이트 데이터(가상 샘플)</p>
    </div>
    ${r.kind === "team" ? teamView() : playerView()}
    <div class="act-row">
      <button class="btn pri" id="pdfBtn" type="button">PDF로 저장</button>
      <button class="btn" id="againBtn" type="button">조건 바꿔 다시 분석</button>
      <a class="btn" href="history.html">분석 기록 보기</a>
    </div>`;

  // 상세 보고서: 저장된 것이 있으면 그대로, 이전에 만든 기록이면 지금 만든다
  const repBox = document.getElementById("repBox");
  if (repBox) {
    (async () => {
      let rep = r.report;
      if (!rep) {
        try {
          const meta = await BL.Api.meta();
          const rows = await (rec.type === "batter" ? BL.Api.batters(rec.season) : BL.Api.pitchers(rec.season));
          const prev = (meta.seasons || []).includes(rec.season - 1) ? await (rec.type === "batter" ? BL.Api.batters(rec.season - 1) : BL.Api.pitchers(rec.season - 1)) : null;
          rep = Detail.build(rec.type, rows, rec.params.target, meta.qualify, meta, prev);
        } catch (e) { rep = null; }
      }
      if (rep) repBox.innerHTML = `<div class="rep-head"><h2 class="rep-title">${rec.type === "batter" ? "타자" : "투수"} 상세 분석 보고서</h2></div>` + Detail.render(rep);
    })();
  }

  document.getElementById("pdfBtn").addEventListener("click", async e => {
    const btn = e.currentTarget, label = btn.textContent;
    btn.disabled = true; btn.textContent = "보고서를 만드는 중...";
    try {
      await Report.generate(rec, "save");
      toast(`${Report.fileName(rec)} 파일을 저장했습니다.`);
    } catch (err) {
      toast(err && err.message ? err.message : "PDF를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    } finally { btn.disabled = false; btn.textContent = label; }
  });

  document.getElementById("againBtn").addEventListener("click", () => {
    Store.saveWizard({ mode: "record", source: "site", type: rec.type, season: rec.season, target: rec.params.target, teams: rec.params.teams, metrics: rec.params.metrics });
    location.href = "analyze.html#3";
  });
})();
