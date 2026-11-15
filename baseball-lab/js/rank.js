/* 선수 순위: 한 표에서 정렬하고, 유형 버튼(규칙형)과 자동 군집(K-평균)으로 선수를 묶어 본다. 로그인 없이 볼 수 있다. */
(async function () {
  "use strict";
  BL.renderShell("rank");
  const { Api, esc, Store } = BL;
  const view = document.getElementById("view");
  let meta, bat, pit;
  try { [meta, bat, pit] = await Promise.all([Api.meta(), Api.batters(2026), Api.pitchers(2026)]); }
  catch (e) { view.innerHTML = '<div class="err-box" role="alert"><b>KBO 데이터를 불러오지 못했습니다.</b><br />로컬 서버(localhost)로 열었는지 확인해 주세요.</div>'; return; }

  const div = (a, b) => (b ? a / b : null);
  const pc = v => (v == null ? "-" : (v * 100).toFixed(1) + "%");
  const f1 = v => (v == null ? "-" : v.toFixed(1)), f2 = v => (v == null ? "-" : v.toFixed(2));
  const f3 = v => (v == null ? "-" : v < 1 ? v.toFixed(3).replace(/^0/, "") : v.toFixed(3));
  const f0 = v => (v == null ? "-" : String(Math.round(v)));

  // ---------- 지표(열) ----------
  const bpa = s => s.ab + s.bb + s.hbp + s.sf;
  const bf = s => s.outs + s.h + s.bb + s.hbp;   // 상대한 타자 수(근사)
  const obp = s => div(s.h + s.bb + s.hbp, bpa(s)), slg = s => div(s.h + s.d2 + 2 * s.d3 + 3 * s.hr, s.ab);
  const C = {
    batter: [
      { k: "pa", t: "타석", f: f0, v: s => s.pa }, { k: "avg", t: "타율", f: f3, v: s => div(s.h, s.ab) }, { k: "obp", t: "출루율", f: f3, v: obp },
      { k: "slg", t: "장타율", f: f3, v: slg }, { k: "ops", t: "OPS", f: f3, v: s => (obp(s) == null || slg(s) == null ? null : obp(s) + slg(s)) },
      { k: "hr", t: "홈런", f: f0, v: s => s.hr }, { k: "bb", t: "BB%", f: pc, v: s => div(s.bb, bpa(s)) }, { k: "so", t: "K%", f: pc, v: s => div(s.so, bpa(s)) },
      { k: "con", t: "컨택%", f: pc, v: s => div(s.sw - s.wh, s.sw) }, { k: "chs", t: "Chase%", f: pc, v: s => div(s.ozsw, s.oz) },
    ],
    pitcher: [
      { k: "ip", t: "이닝", f: f1, v: s => s.outs / 3 }, { k: "era", t: "ERA", f: f2, v: s => div(s.er * 27, s.outs) },
      { k: "fip", t: "FIP", f: f2, v: s => (s.outs ? (13 * s.hr + 3 * s.bb - 2 * s.so) / (s.outs / 3) + 3.1 : null) },
      { k: "k", t: "K%", f: pc, v: s => div(s.so, bf(s)) }, { k: "b", t: "BB%", f: pc, v: s => div(s.bb, bf(s)) },
      { k: "kb", t: "K-BB%", f: pc, v: s => (bf(s) ? (s.so - s.bb) / bf(s) : null) }, { k: "wh", t: "헛스윙%", f: pc, v: s => div(s.wh, s.sw) },
      { k: "chs", t: "유인%", f: pc, v: s => div(s.ozsw, s.oz) }, { k: "fb", t: "직구 구속", f: f1, v: s => (s.fb > 0 ? s.fb : null) },
    ],
  };
  const SPEC = { batter: { basic: ["pa", "avg", "ops", "hr"], first: "ops" }, pitcher: { basic: ["ip", "era", "fip"], first: "era" } };

  // ---------- 유형 버튼(규칙형): 임계값을 화면에 그대로 보여 준다 ----------
  const TYPES = {
    batter: [
      { id: "pow", t: "파워 (홈런 20개↑)", rule: "홈런이 20개 이상", ok: s => s.hr >= 20 },
      { id: "con", t: "컨택형 (컨택% 84%↑)", rule: "스윙한 공 중 84% 이상을 맞힘", ok: s => div(s.sw - s.wh, s.sw) >= 0.84 },
      { id: "eye", t: "선구안 좋은 (BB% 10%↑·Chase% 25%↓)", rule: "볼넷 비율 10% 이상이고 존 밖 스윙 비율 25% 이하", ok: s => div(s.bb, bpa(s)) >= 0.10 && div(s.ozsw, s.oz) <= 0.25 },
    ],
    pitcher: [
      { id: "pow", t: "파워 피처 (K% 24%↑)", rule: "삼진 비율이 24% 이상", ok: s => div(s.so, bf(s)) >= 0.24 },
      { id: "ctl", t: "제구 장인 (BB% 6.5%↓)", rule: "볼넷 비율이 6.5% 이하", ok: s => div(s.bb, bf(s)) <= 0.065 },
      { id: "bad", t: "결과가 아쉬운 (FIP가 ERA보다 0.75↓)", rule: "FIP가 평균자책점보다 0.75 이상 낮음(운이 나빴을 가능성)", ok: s => s.outs && C.pitcher[2].v(s) <= C.pitcher[1].v(s) - 0.75 },
      { id: "whf", t: "헛스윙 유도형 (헛스윙% 25%↑)", rule: "타자가 휘두른 공 중 25% 이상이 헛스윙", ok: s => div(s.wh, s.sw) >= 0.25 },
    ],
  };

  // ---------- K-평균 군집 (브라우저에서 즉석 계산) ----------
  const FEAT = {
    batter: [["K%", C.batter[7].v], ["BB%", C.batter[6].v], ["컨택%", C.batter[8].v], ["Chase%", C.batter[9].v], ["ISO", s => (slg(s) == null ? null : slg(s) - s.h / s.ab)]],
    pitcher: [["K%", C.pitcher[3].v], ["BB%", C.pitcher[4].v], ["헛스윙%", C.pitcher[6].v], ["구속", C.pitcher[8].v]],
  };
  function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function kmeans(X, k, seed) {
    const r = rng(seed), n = X.length, d = X[0].length, dist = (a, b) => a.reduce((t, v, i) => t + (v - b[i]) ** 2, 0);
    let cen = [X[Math.floor(r() * n)].slice()];
    while (cen.length < k) {   // k-means++ 초기화
      const w = X.map(x => Math.min(...cen.map(c => dist(x, c)))), tot = w.reduce((a, b) => a + b, 0);
      let t = r() * tot, i = 0; while (i < n - 1 && (t -= w[i]) > 0) i++;
      cen.push(X[i].slice());
    }
    let lab = new Array(n).fill(-1);
    for (let it = 0; it < 60; it++) {
      const nl = X.map(x => { let b = 0, bd = Infinity; cen.forEach((c, j) => { const dd = dist(x, c); if (dd < bd) { bd = dd; b = j; } }); return b; });
      const same = nl.every((v, i) => v === lab[i]); lab = nl; if (same) break;
      cen = cen.map((c, j) => { const m = X.filter((_, i) => lab[i] === j); return m.length ? Array.from({ length: d }, (_, q) => m.reduce((t, x) => t + x[q], 0) / m.length) : c; });
    }
    return { lab, cen, inertia: X.reduce((t, x, i) => t + dist(x, cen[lab[i]]), 0) };
  }
  function silhouette(X, lab, k) {
    const dist = (a, b) => Math.sqrt(a.reduce((t, v, i) => t + (v - b[i]) ** 2, 0));
    let tot = 0;
    X.forEach((x, i) => {
      const sum = new Array(k).fill(0), cnt = new Array(k).fill(0);
      X.forEach((y, j) => { if (i !== j) { sum[lab[j]] += dist(x, y); cnt[lab[j]]++; } });
      if (!cnt[lab[i]]) return;
      const a = sum[lab[i]] / cnt[lab[i]];
      let b = Infinity; for (let c = 0; c < k; c++) if (c !== lab[i] && cnt[c]) b = Math.min(b, sum[c] / cnt[c]);
      tot += (b - a) / Math.max(a, b);
    });
    return tot / X.length;
  }
  function cluster(type, rows) {
    const fs = FEAT[type], ok = rows.filter(s => fs.every(f => f[1](s) != null));
    if (ok.length < 12) return null;
    const raw = ok.map(s => fs.map(f => f[1](s)));
    const mu = fs.map((_, q) => raw.reduce((t, x) => t + x[q], 0) / raw.length);
    const sd = fs.map((_, q) => Math.sqrt(raw.reduce((t, x) => t + (x[q] - mu[q]) ** 2, 0) / raw.length) || 1);
    const X = raw.map(x => x.map((v, q) => (v - mu[q]) / sd[q]));
    let best = null;
    for (let k = 2; k <= 6 && k <= ok.length / 4; k++) {
      let run = null; for (let s = 1; s <= 8; s++) { const m = kmeans(X, k, s * 7919); if (!run || m.inertia < run.inertia) run = m; }
      const sil = silhouette(X, run.lab, k);
      if (!best || sil > best.sil) best = { k, sil, lab: run.lab };
    }
    const groups = Array.from({ length: best.k }, (_, j) => {
      const idx = ok.map((_, i) => i).filter(i => best.lab[i] === j);
      const z = fs.map((_, q) => idx.reduce((t, i) => t + X[i][q], 0) / idx.length);
      const avg = fs.map((_, q) => idx.reduce((t, i) => t + raw[i][q], 0) / idx.length);
      const hi = [], lo = [];
      z.forEach((v, q) => { if (v > 0.4) hi.push(fs[q][0] + "↑"); else if (v < -0.4) lo.push(fs[q][0] + "↓"); });
      const nm = hi.concat(lo).join(" · ") || "평균형";
      return { j, n: idx.length, name: nm, avg, z, ids: new Set(idx.map(i => ok[i].pid)) };
    });
    return { k: best.k, sil: best.sil, groups, feats: fs.map(f => f[0]), n: ok.length };
  }

  // ---------- 화면 ----------
  const st = { type: "pitcher", team: "", scope: "q", min: 0, role: "", rule: "", grp: null, sort: null, dir: 1, q: "" };
  const rows = () => (st.type === "batter" ? bat : pit);
  const qual = s => (st.type === "batter" ? s.pa >= meta.qualify.batterPa : s.outs >= meta.qualify.pitcherOuts);
  const fmtDisp = (c, s) => c.f(c.v(s));

  function filtered() {
    const cols = C[st.type];
    let list = rows().filter(s => (!st.team || s.team === st.team) && (st.scope === "all" || qual(s)) && (!st.q || s.name.includes(st.q)));
    if (st.type === "pitcher" && st.role) list = list.filter(s => s.pos === st.role);
    if (st.min > 0) list = list.filter(s => (st.type === "batter" ? s.pa : s.outs / 3) >= st.min);
    const rule = st.rule && TYPES[st.type].find(r => r.id === st.rule);
    if (rule) list = list.filter(s => rule.ok(s));
    return list;
  }

  function draw() {
    const cols = C[st.type], types = TYPES[st.type], list = filtered();
    const cl = cluster(st.type, st.scope === "all" ? rows().filter(s => (st.type === "batter" ? s.pa >= 100 : s.outs >= 90)) : rows().filter(qual));
    if (st.grp != null && !(cl && cl.groups[st.grp])) st.grp = null;
    let out = list;
    if (st.grp != null) out = out.filter(s => cl.groups[st.grp].ids.has(s.pid));
    const sk = st.sort || SPEC[st.type].first, sc = cols.find(c => c.k === sk) || cols[0];
    const dflt = st.sort ? st.dir : (["era", "fip"].includes(sc.k) ? 1 : -1);
    out = out.slice().sort((a, b) => { const x = sc.v(a), y = sc.v(b); if (x == null) return 1; if (y == null) return -1; return (x - y) * dflt; });
    const shown = out.slice(0, 200);
    const cur = k => (sk === k ? ` aria-sort="${dflt > 0 ? "ascending" : "descending"}"` : "");
    view.innerHTML = `
      <div class="result-head"><h1>선수 순위</h1><p class="sub">KBO 2026 정규시즌 실제 기록입니다. 열 이름을 누르면 그 기준으로 정렬됩니다.</p></div>
      <div class="rk-tabs" role="tablist">
        <button type="button" role="tab" aria-selected="${st.type === "pitcher"}" data-t="pitcher">투수 순위</button>
        <button type="button" role="tab" aria-selected="${st.type === "batter"}" data-t="batter">타자 순위</button></div>
      <section class="rk-filter"><div class="rk-row">
        <label>팀<select id="fTeam"><option value="">전체</option>${meta.teams.map(t => `<option value="${esc(t.id)}"${st.team === t.id ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>
        <label>범위<select id="fScope"><option value="q"${st.scope === "q" ? " selected" : ""}>규정 채운 선수(${st.type === "batter" ? "타석 " + meta.qualify.batterPa + "↑" : Math.round(meta.qualify.pitcherOuts / 3) + "이닝↑"})</option><option value="all"${st.scope === "all" ? " selected" : ""}>전체 선수</option></select></label>
        ${st.type === "pitcher" ? `<label>보직<select id="fRole"><option value="">전체</option><option${st.role === "선발" ? " selected" : ""}>선발</option><option${st.role === "구원" ? " selected" : ""}>구원</option></select></label>` : ""}
        <label>최소 ${st.type === "batter" ? "타석" : "이닝"}<input id="fMin" type="number" min="0" step="10" value="${st.min || ""}" placeholder="0" /></label>
        <label>이름<input id="fQ" type="search" value="${esc(st.q)}" placeholder="선수 이름" /></label></div>
        <div class="rk-chips" aria-label="유형">
          ${types.map(r => `<button type="button" class="chip${st.rule === r.id ? " on" : ""}" data-r="${r.id}" title="${esc(r.rule)}">${esc(r.t)}</button>`).join("")}
          ${st.rule ? '<button type="button" class="chip clr" data-r="">유형 해제</button>' : ""}</div>
        ${st.rule ? `<p class="note">${esc(types.find(r => r.id === st.rule).rule)}인 선수만 보여 줍니다. 기준 숫자는 이 사이트에서 정한 값입니다.</p>` : ""}
        ${cl ? `<div class="rk-cl"><b>자동 유형(군집)</b> <small>${cl.n}명을 ${esc(cl.feats.join("·"))}만으로 ${cl.k}개로 나눈 결과예요.</small><div class="rk-chips">
          ${cl.groups.map(g => `<button type="button" class="chip cl${st.grp === g.j ? " on" : ""}" data-g="${g.j}">${esc(g.name)} <small>${g.n}명</small></button>`).join("")}
          ${st.grp != null ? '<button type="button" class="chip clr" data-g="">군집 해제</button>' : ""}</div>
          ${st.grp != null ? `<p class="note">이 군집의 평균: ${cl.feats.map((f, q) => `${esc(f)} ${esc(clFmt(f, cl.groups[st.grp].avg[q]))}`).join(", ")}</p>` : ""}
          <p class="note">군집 이름은 평균보다 뚜렷이 높거나(↑) 낮은(↓) 지표를 나열한 것이고, 고정된 유형명이 아닙니다. 군집이 얼마나 뚜렷한지 나타내는 실루엣 점수는 <b>${cl.sil.toFixed(2)}</b>입니다(0.5 이상이면 뚜렷, 0.25 아래면 억지로 나눈 구조일 수 있음).</p></div>` : ""}
      </section>
      <section class="sec"><p class="sub">${out.length}명${out.length > shown.length ? ` 중 상위 ${shown.length}명` : ""}. 이름을 누르면 그 선수 분석을 시작합니다.</p>
        <div class="table-wrap"><table class="rk"><thead><tr><th>#</th><th>선수</th><th>팀</th>${cols.map(c => `<th data-s="${c.k}" class="srt"${cur(c.k)}><button type="button">${c.t}${sk === c.k ? (dflt > 0 ? " ▲" : " ▼") : ""}</button></th>`).join("")}</tr></thead>
        <tbody>${shown.map((s, i) => `<tr><td>${i + 1}</td><td><button type="button" class="nm-btn" data-p="${esc(s.pid)}">${esc(s.name)}</button> <small class="muted">${esc(s.pos)}</small>${qual(s) ? "" : ' <small class="muted">(규정 미달)</small>'}</td><td>${esc(s.team)}</td>${cols.map(c => `<td${c.k === sk ? ' class="hl"' : ""}>${esc(fmtDisp(c, s))}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${cols.length + 3}">조건에 맞는 선수가 없습니다. 조건을 줄여 보세요.</td></tr>`}</tbody></table></div>
        <p class="note">컨택%·Chase%·헛스윙%는 투구 위치 기록으로 계산한 값입니다(존 안: 좌우 홈플레이트 폭 안, 위아래 타자별 존 안). 자세한 뜻은 <a href="guide.html">지표 설명</a>을 보세요.</p></section>`;
    bind(cl);
  }
  const clFmt = (f, v) => (f === "구속" ? v.toFixed(1) + "km/h" : f === "ISO" ? f3(v) : pc(v));

  function bind(cl) {
    const $ = s => view.querySelector(s);
    view.querySelectorAll("[data-t]").forEach(b => b.addEventListener("click", () => { Object.assign(st, { type: b.dataset.t, rule: "", grp: null, sort: null, dir: 1, role: "", min: 0 }); draw(); }));
    $("#fTeam").addEventListener("change", e => { st.team = e.target.value; draw(); });
    $("#fScope").addEventListener("change", e => { st.scope = e.target.value; st.grp = null; draw(); });
    const fr = $("#fRole"); if (fr) fr.addEventListener("change", e => { st.role = e.target.value; draw(); });
    $("#fMin").addEventListener("change", e => { st.min = Math.max(0, +e.target.value || 0); draw(); });
    $("#fQ").addEventListener("input", e => { st.q = e.target.value.trim(); const p = e.target.selectionStart; draw(); const n = $("#fQ"); n.focus(); n.setSelectionRange(p, p); });
    view.querySelectorAll("[data-r]").forEach(b => b.addEventListener("click", () => { st.rule = b.dataset.r === st.rule ? "" : b.dataset.r; draw(); }));
    view.querySelectorAll("[data-g]").forEach(b => b.addEventListener("click", () => { st.grp = b.dataset.g === "" || +b.dataset.g === st.grp ? null : +b.dataset.g; draw(); }));
    view.querySelectorAll("th.srt").forEach(th => th.querySelector("button").addEventListener("click", () => {
      const k = th.dataset.s; if (st.sort === k) st.dir = -st.dir; else { st.sort = k; st.dir = ["era", "fip", "b"].includes(k) ? 1 : -1; } draw();
    }));
    view.querySelectorAll(".nm-btn").forEach(b => b.addEventListener("click", () => {
      Store.saveWizard({ mode: "record", source: "site", type: st.type, season: 2026, target: b.dataset.p, teams: [], metrics: (st.type === "batter" ? ["AVG", "OPS", "HR"] : ["ERA", "WHIP", "K9"]) });
      location.href = "analyze.html#3";
    }));
  }
  draw();
})();
