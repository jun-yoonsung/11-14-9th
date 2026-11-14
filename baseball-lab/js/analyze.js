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
    view.innerHTML = '<div class="err-box" role="alert"><b>KBO 데이터를 불러오지 못했습니다.</b><br />data 폴더가 없다면 README.md의 "데이터 만들기"대로 build_data.py를 먼저 실행해 주세요. 파일을 더블클릭해서 열었다면 로컬 서버(localhost)로 열어야 합니다.</div>';
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
      <button class="option ${w.source === "site" ? "sel" : ""}" type="button" data-act="src-site"><span class="ic">${icData}</span><span><b>사이트 데이터</b><small>${meta.league} ${meta.seasons.slice().sort().join("·")} 정규시즌 ${meta.teams.length}개 팀의 타자·투수·팀 기록 (${meta.range[0]} ~ ${meta.range[1]})</small></span></button>
      <button class="option off" type="button" disabled aria-describedby="upHint"><span class="ic">${icUpload}</span><span><b>내 데이터 업로드 <span class="pill">다음 버전</span></b><small id="upHint">가지고 있는 기록 파일로 분석하는 기능은 다음 버전에서 제공됩니다</small></span></button>
      <div class="err-msg" id="err" role="alert">${esc(errors.source || "")}</div>
      <div class="actions"><button class="btn" type="button" data-act="back">이전</button><button class="btn pri grow" type="button" data-act="next2">다음</button></div></div>`;
  }
  // ---------- 선수 검색 ----------
  const playerLabel = p => `${p.name} · ${teamName(p.team)} · ${p.pos}`;
  const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  const initials = str => [...str].map(ch => { const c = ch.charCodeAt(0) - 44032; return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch; }).join("");
  function searchPlayers(query) {
    const q = query.trim().toLowerCase().replace(/\s+/g, ""), T = Stats.TYPES[w.type];
    const size = p => (w.type === "batter" ? p.pa : p.outs);
    const hay = p => { const t = (p.name + teamName(p.team) + p.pos).toLowerCase(); return [t, initials(p.name) + initials(teamName(p.team)) + p.pos.toLowerCase()]; };
    const hit = q ? rows.filter(p => hay(p).some(h => h.includes(q))) : rows.slice();
    return hit.sort((a, b) => {
      const an = a.name.toLowerCase().startsWith(q) || initials(a.name).startsWith(q) ? 0 : 1, bn = b.name.toLowerCase().startsWith(q) || initials(b.name).startsWith(q) ? 0 : 1;
      return an - bn || size(b) - size(a);
    }).map(p => Object.assign({ ok: T.qualify(p, meta.qualify) }, { p }));
  }
  let comboIdx = -1, comboItems = [];
  function showCombo(query) {
    const input = document.getElementById("player"), list = document.getElementById("plist");
    if (!input || !list) return;
    const all = searchPlayers(query), MAX = 40;
    comboItems = all.slice(0, MAX); comboIdx = comboItems.length ? 0 : -1;
    list.innerHTML = comboItems.length
      ? comboItems.map((it, i) => `<li role="option" id="po${i}" data-pid="${it.p.pid}" aria-selected="${i === comboIdx}"><b>${esc(it.p.name)}</b><span>${esc(teamName(it.p.team))} · ${esc(it.p.pos)}</span>${it.ok ? "" : '<em>규정 미달</em>'}</li>`).join("") +
        (all.length > MAX ? `<li class="combo-more" aria-hidden="true">외 ${all.length - MAX}명 · 검색어를 입력해 좁혀 보세요</li>` : "")
      : '<li class="combo-more" aria-hidden="true">검색 결과가 없어요. 이름이나 팀을 다시 확인해 주세요.</li>';
    list.hidden = false; input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-activedescendant", comboIdx >= 0 ? "po0" : "");
  }
  function hideCombo() {
    const input = document.getElementById("player"), list = document.getElementById("plist");
    if (!input || !list) return;
    list.hidden = true; input.setAttribute("aria-expanded", "false");
    const cur = rows.find(p => p.pid === w.target);
    input.value = cur ? playerLabel(cur) : "";   // 고르지 않고 닫으면 원래 선택으로 되돌린다
  }
  function pickPlayer(pid) { w.target = pid; save(); errors.target = ""; render(); }
  function moveCombo(d) {
    if (!comboItems.length) return;
    comboIdx = (comboIdx + d + comboItems.length) % comboItems.length;
    document.querySelectorAll("#plist [role=option]").forEach((li, i) => li.setAttribute("aria-selected", String(i === comboIdx)));
    const li = document.getElementById("po" + comboIdx);
    if (li) { li.scrollIntoView({ block: "nearest" }); document.getElementById("player").setAttribute("aria-activedescendant", li.id); }
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
      // 검색해서 고르는 선수 입력칸 (이름, 팀, 포지션, 초성으로 찾는다)
      const cur = rows.find(p => p.pid === w.target);
      target = `<div class="combo"><label class="label" for="player">${ty.short}</label>
        <input class="field ${errors.target ? "err" : ""}" id="player" data-act="player-search" type="text" role="combobox" aria-expanded="false" aria-controls="plist" aria-autocomplete="list" autocomplete="off" spellcheck="false"
          placeholder="이름, 팀, 포지션으로 검색 (예: 김도영, ㄱㄷㅇ)" value="${cur ? esc(playerLabel(cur)) : ""}" />
        <ul class="combo-list" id="plist" role="listbox" hidden></ul>
        <p class="hint">${cur ? "다른 선수를 보려면 칸을 눌러 새로 검색하세요. " : ""}타석이나 이닝이 많은 선수가 먼저 나옵니다. 규정 미달 선수는 순위 없이 참고용으로 분석됩니다.</p>
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
        const monthly = await Api.monthly(w.type, w.target);
        const mix = w.type === "pitcher" ? await Api.pitchmix(w.target) : null;
        result.report = Detail.build(w.type, rows, w.target, meta.qualify, meta, monthly, mix);
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
  });
  view.addEventListener("focusin", e => { if (e.target.id === "player") { const cur = rows.find(p => p.pid === w.target); const same = !e.target.value || (cur && e.target.value === playerLabel(cur)); if (same) e.target.select(); showCombo(same ? "" : e.target.value); } });
  view.addEventListener("input", e => { if (e.target.id === "player") showCombo(e.target.value); });
  view.addEventListener("focusout", e => { if (e.target.id === "player") setTimeout(hideCombo, 120); });
  view.addEventListener("mousedown", e => { const li = e.target.closest("#plist [data-pid]"); if (li) { e.preventDefault(); pickPlayer(li.dataset.pid); } });
  view.addEventListener("keydown", e => {
    if (e.target.id !== "player") return;
    const list = document.getElementById("plist");
    if (e.key === "ArrowDown") { e.preventDefault(); if (list.hidden) showCombo(e.target.value); else moveCombo(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveCombo(-1); }
    else if (e.key === "Enter") { if (!list.hidden && comboIdx >= 0) { e.preventDefault(); pickPlayer(comboItems[comboIdx].p.pid); } }
    else if (e.key === "Escape") { hideCombo(); }
  });
  window.addEventListener("hashchange", () => {
    const n = Number(location.hash.slice(1)) || 1;
    step = n > 1 && w.mode !== "record" ? 1 : n > 2 && w.source !== "site" ? 2 : n;
    errors = {}; render();
  });

  render();
})();
