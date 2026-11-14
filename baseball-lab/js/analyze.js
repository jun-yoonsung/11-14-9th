/* 데이터 분석: ① 분석 방식 → ② 데이터 출처 → ③ 분석 설정 → 결과 */
(async function () {
  "use strict";
  if (!BL.Auth.require()) return;
  BL.renderShell("analyze");
  const { Store, Api, esc, toast } = BL;
  const TY = Stats.TYPES;
  const view = document.getElementById("view");

  const icTable = '<svg viewBox="0 0 24 24" fill="none" stroke="#1d3fbb" stroke-width="1.8" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M9.5 9.5v10"/></svg>';
  const icVideo = '<svg viewBox="0 0 24 24" fill="none" stroke="#5c667d" stroke-width="1.8" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10.5l5-3v9l-5-3z"/></svg>';
  const icData = '<svg viewBox="0 0 24 24" fill="none" stroke="#1d3fbb" stroke-width="1.8" aria-hidden="true"><ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/></svg>';
  const icUpload = '<svg viewBox="0 0 24 24" fill="none" stroke="#5c667d" stroke-width="1.8" aria-hidden="true"><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M4.5 15v3.5a1.5 1.5 0 001.5 1.5h12a1.5 1.5 0 001.5-1.5V15"/></svg>';

  let meta;
  try { meta = await Api.meta(); }
  catch (e) {
    view.innerHTML = '<div class="err-box" role="alert"><b>샘플 데이터를 불러오지 못했습니다.</b><br />파일을 더블클릭해서 열면 데이터를 읽을 수 없어요. README.md의 "실행 방법"대로 로컬 서버를 켜고 주소(localhost)로 열어 주세요.</div>';
    return;
  }
  const teamName = id => (meta.teams.find(t => t.id === id) || {}).name || id;

  // ---------- 상태 ----------
  const w = Store.wizard();
  const params = new URLSearchParams(location.search);
  const wantType = params.get("type");
  if (TY[wantType] && w.type !== wantType) { w.type = wantType; w.target = ""; w.teams = []; w.metrics = TY[wantType].defaults.slice(); }
  if (!TY[w.type]) w.type = "batter";
  if (!w.season) w.season = meta.seasons[0];
  if (!Array.isArray(w.metrics)) w.metrics = TY[w.type].defaults.slice();
  if (!Array.isArray(w.teams)) w.teams = [];
  Store.saveWizard(w);

  let step = Number((location.hash || "#1").slice(1)) || 1;
  if (step > 1 && w.mode !== "record") step = 1;
  if (step > 2 && w.source !== "site") step = 2;
  let rows = [];   // 선택한 시즌의 선수 또는 팀 목록
  let errors = {};

  const go = n => { step = n; errors = {}; history.replaceState(null, "", "#" + n); render(); window.scrollTo(0, 0); };
  const save = () => Store.saveWizard(w);
  const stepsBar = n => `<div class="steps" aria-label="진행 단계">${["분석 방식", "데이터 출처", "분석 설정"].map((s, i) =>
    `<span class="${i + 1 < n ? "done" : i + 1 === n ? "on" : ""}"${i + 1 === n ? ' aria-current="step"' : ""}>${i + 1}. ${s}</span>`).join("")}</div>`;

  async function loadRows() {
    if (w.type === "batter") rows = await Api.batters(w.season);
    else if (w.type === "pitcher") rows = await Api.pitchers(w.season);
    else rows = await Api.teams(w.season);
  }

  // ---------- 화면 ----------
  function viewStep1() {
    return `${stepsBar(1)}<div class="panel">
      <h1>어떤 데이터를 분석할까요?</h1>
      <button class="option ${w.mode === "record" ? "sel" : ""}" type="button" data-act="mode-record"><span class="ic">${icTable}</span><span><b>기록 데이터</b><small>타율, 홈런, 평균자책점 같은 숫자 기록을 분석합니다</small></span></button>
      <button class="option off" type="button" data-act="mode-video" aria-describedby="videoHint"><span class="ic">${icVideo}</span><span><b>영상 데이터 <span class="pill">준비 중</span></b><small id="videoHint">투구 폼, 타구 궤적 분석은 다음 버전에서 제공됩니다</small></span></button>
      <div class="err-msg" id="err" role="alert">${esc(errors.mode || "")}</div>
      <div class="actions"><button class="btn pri grow" type="button" data-act="next1">다음</button></div></div>`;
  }
  function viewStep2() {
    return `${stepsBar(2)}<div class="panel">
      <h1>어떤 데이터로 분석할까요?</h1>
      <button class="option ${w.source === "site" ? "sel" : ""}" type="button" data-act="src-site"><span class="ic">${icData}</span><span><b>사이트 데이터</b><small>가상 ${meta.teams.length}개 팀, ${meta.seasons.slice().sort().join("·")} 시즌의 타자·투수·팀 기록</small></span></button>
      <button class="option off" type="button" disabled aria-describedby="upHint"><span class="ic">${icUpload}</span><span><b>내 데이터 업로드 <span class="pill">다음 버전</span></b><small id="upHint">가지고 있는 기록 파일로 분석하는 기능은 다음 버전에서 제공됩니다</small></span></button>
      <div class="err-msg" id="err" role="alert">${esc(errors.source || "")}</div>
      <div class="actions"><button class="btn" type="button" data-act="back">이전</button><button class="btn pri grow" type="button" data-act="next2">다음</button></div></div>`;
  }
  function viewStep3() {
    const ty = TY[w.type];
    const seg = Object.keys(TY).map(k => `<button type="button" data-act="type" data-v="${k}" aria-pressed="${w.type === k}">${TY[k].label}</button>`).join("");
    const seasons = meta.seasons.map(s => `<option value="${s}" ${s === w.season ? "selected" : ""}>${s}</option>`).join("");
    let target;
    if (w.type === "team") {
      target = `<div><span class="label" id="tl">비교할 팀 <span class="count">${w.teams.length} / 4개</span></span>
        <div class="chips" role="group" aria-labelledby="tl">${rows.map(t => `<button class="chip" type="button" data-act="team" data-v="${t.id}" aria-pressed="${w.teams.includes(t.id)}">${esc(t.name)}</button>`).join("")}</div>
        <div class="err-msg" id="errTarget" role="alert">${esc(errors.target || "")}</div></div>`;
    } else {
      const sorted = rows.slice().sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name, "ko"));
      target = `<div><label class="label" for="player">${ty.short === "타자" ? "타자" : "투수"}</label>
        <select class="field ${errors.target ? "err" : ""}" id="player" data-act="player"><option value="">${ty.short}를 고르세요</option>${sorted.map(p => `<option value="${p.pid}" ${p.pid === w.target ? "selected" : ""}>${esc(p.name)} (${esc(teamName(p.team))})</option>`).join("")}</select>
        <div class="err-msg" id="errTarget" role="alert">${esc(errors.target || "")}</div></div>`;
    }
    const chips = ty.defs.map(d => `<button class="chip" type="button" data-act="metric" data-v="${d.key}" aria-pressed="${w.metrics.includes(d.key)}" title="${esc(d.how)}">${esc(d.label)}${d.label !== d.en ? " " + esc(d.en) : ""}</button>`).join("");
    return `${stepsBar(3)}<div class="panel">
      <h1>무엇을 분석할까요?</h1>
      <div class="seg" role="group" aria-label="분석 종류">${seg}</div>
      <div class="row2"><div><label class="label" for="season">시즌</label><select class="field" id="season" data-act="season">${seasons}</select></div>${target}</div>
      <div><span class="label" id="ml">볼 지표 <span class="count">${w.metrics.length} / ${Stats.MAX_METRICS}개</span></span>
        <div class="chips" role="group" aria-labelledby="ml">${chips}</div>
        <div class="err-msg" id="errMetric" role="alert">${esc(errors.metric || "")}</div>
        <p class="hint">지표 이름에 마우스를 올리면 계산 방법이 보여요.</p></div>
      <div class="actions"><button class="btn" type="button" data-act="back">이전</button><button class="btn pri grow" type="button" data-act="run" id="runBtn">분석하기</button></div></div>`;
  }

  async function render() {
    if (step === 3) await loadRows();
    view.innerHTML = step === 1 ? viewStep1() : step === 2 ? viewStep2() : viewStep3();
    document.title = `데이터 분석 ${step}/3 | 야구 분석 랩`;
  }

  // ---------- 분석 실행 ----------
  async function run() {
    const ty = TY[w.type];
    errors = {};
    if (w.type === "team") {
      if (w.teams.length < 2) errors.target = "팀을 2개 이상 선택해 주세요.";
    } else if (!w.target) errors.target = `${ty.short}를 선택해 주세요.`;
    if (!w.metrics.length) errors.metric = "지표를 1개 이상 선택해 주세요.";
    if (errors.target || errors.metric) {
      await render();
      const first = document.querySelector("#player.err, #errTarget:not(:empty), #errMetric:not(:empty)");
      if (first) first.scrollIntoView({ block: "center" });
      return;
    }
    const btn = document.getElementById("runBtn");
    btn.disabled = true; btn.textContent = "분석하는 중...";
    let result, title;
    if (w.type === "team") {
      result = Stats.analyzeTeams(rows, w.teams, w.metrics);
      title = `${w.teams.length}개 팀 ${w.season} 팀 비교`;
    } else {
      result = Stats.analyzePlayer(w.type, rows, w.target, w.metrics, meta.qualify);
      result.teamName = teamName(result.subject.team);
      try {   // 상세 보고서: 유형(타자·투수)에 맞는 항목을 만들어 함께 저장
        const prevSeason = (meta.seasons || []).includes(w.season - 1) ? w.season - 1 : null;
        let prevRows = null;
        if (prevSeason) prevRows = await (w.type === "batter" ? Api.batters(prevSeason) : Api.pitchers(prevSeason));
        result.report = Detail.build(w.type, rows, w.target, meta.qualify, meta, prevRows);
      } catch (err) { console.warn("상세 보고서를 만들지 못했습니다", err); }
      title = `${result.subject.name} ${w.season} ${ty.label}`;
    }
    const rec = {
      id: Store.newId(), createdAt: new Date().toISOString(), mode: "record", source: "site",
      type: w.type, season: w.season, title,
      params: { target: w.target || "", teams: w.teams.slice(), metrics: w.metrics.slice() }, result,
    };
    Store.add(rec);
    location.href = "result.html?id=" + encodeURIComponent(rec.id);
  }

  // ---------- 클릭 처리 ----------
  view.addEventListener("click", e => {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const act = el.dataset.act, v = el.dataset.v;
    if (act === "mode-record") { w.mode = "record"; save(); go(2); }
    else if (act === "mode-video") { toast("영상 분석은 다음 버전에서 제공됩니다."); errors.mode = "영상 분석은 다음 버전에서 제공됩니다. 기록 데이터를 선택해 주세요."; document.getElementById("err").textContent = errors.mode; }
    else if (act === "next1") { if (w.mode === "record") go(2); else { errors.mode = "분석 방식을 선택해 주세요."; document.getElementById("err").textContent = errors.mode; } }
    else if (act === "src-site") { w.source = "site"; save(); go(3); }
    else if (act === "next2") { if (w.source === "site") go(3); else { errors.source = "데이터 출처를 선택해 주세요."; document.getElementById("err").textContent = errors.source; } }
    else if (act === "back") go(step - 1);
    else if (act === "type") { if (w.type !== v) { w.type = v; w.target = ""; w.teams = []; w.metrics = TY[v].defaults.slice(); save(); errors = {}; render(); } }
    else if (act === "metric") {
      const i = w.metrics.indexOf(v);
      if (i >= 0) w.metrics.splice(i, 1);
      else if (w.metrics.length >= Stats.MAX_METRICS) { errors.metric = `지표는 최대 ${Stats.MAX_METRICS}개까지 고를 수 있어요.`; document.getElementById("errMetric").textContent = errors.metric; return; }
      else w.metrics.push(v);
      save(); errors = {}; render();
    }
    else if (act === "team") {
      const i = w.teams.indexOf(v);
      if (i >= 0) w.teams.splice(i, 1);
      else if (w.teams.length >= 4) { errors.target = "팀은 최대 4개까지 고를 수 있어요."; document.getElementById("errTarget").textContent = errors.target; return; }
      else w.teams.push(v);
      save(); errors = {}; render();
    }
    else if (act === "run") run();
  });
  view.addEventListener("change", e => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    if (el.dataset.act === "season") { w.season = Number(el.value); save(); render(); }
    else if (el.dataset.act === "player") { w.target = el.value; save(); errors.target = ""; render(); }
  });
  window.addEventListener("hashchange", () => {
    const n = Number(location.hash.slice(1)) || 1;
    step = n > 1 && w.mode !== "record" ? 1 : n > 2 && w.source !== "site" ? 2 : n;
    errors = {}; render();
  });

  render();
})();
