import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Api } from "../lib/api.js";
import { Store } from "../lib/storage.js";
import { COLS, RULES, FIRST_SORT, LOW_FIRST, cluster, fmtFeat } from "../lib/rank.js";
import ClusterMap, { CL_COLORS } from "../components/ClusterMap.jsx";
import { useScene } from "../context/SceneContext.jsx";

const initialState = { type: "pitcher", team: "", scope: "q", min: 0, role: "", rule: "", grp: null, sort: null, dir: 1, q: "" };

/** 선수 순위: 한 표에서 정렬하고, 유형 버튼(규칙형)과 자동 군집(K-평균)으로 선수를 묶어 본다. 로그인 없이 볼 수 있다. */
export default function Rank() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);   // { meta, bat, pit } | "error"
  const [st, setSt] = useState(initialState);
  useScene(st.type);
  const upd = patch => setSt(s => ({ ...s, ...patch }));

  useEffect(() => {
    Promise.all([Api.meta(), Api.batters(2026), Api.pitchers(2026)]).then(([meta, bat, pit]) => setData({ meta, bat, pit })).catch(() => setData("error"));
  }, []);

  const meta = data && data !== "error" ? data.meta : null;
  const all = data && data !== "error" ? (st.type === "batter" ? data.bat : data.pit) : [];
  const qual = s => (st.type === "batter" ? s.pa >= meta.qualify.batterPa : s.outs >= meta.qualify.pitcherOuts);

  const cl = useMemo(() => {
    if (!meta) return null;
    const pool = st.scope === "all" ? all.filter(s => (st.type === "batter" ? s.pa >= 100 : s.outs >= 90)) : all.filter(qual);
    return cluster(st.type, pool);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, st.type, st.scope, all]);

  const grp = st.grp != null && cl && cl.groups[st.grp] ? st.grp : null;
  const cols = COLS[st.type], rules = RULES[st.type];
  const sk = st.sort || FIRST_SORT[st.type];
  const sc = cols.find(c => c.k === sk) || cols[0];
  const dir = st.sort ? st.dir : (["era", "fip"].includes(sc.k) ? 1 : -1);

  const out = useMemo(() => {
    if (!meta) return [];
    let list = all.filter(s => (!st.team || s.team === st.team) && (st.scope === "all" || qual(s)) && (!st.q || s.name.includes(st.q)));
    if (st.type === "pitcher" && st.role) list = list.filter(s => s.pos === st.role);
    if (st.min > 0) list = list.filter(s => (st.type === "batter" ? s.pa : s.outs / 3) >= st.min);
    const rule = st.rule && rules.find(r => r.id === st.rule);
    if (rule) list = list.filter(s => rule.ok(s));
    if (grp != null) list = list.filter(s => cl.groups[grp].ids.has(s.pid));
    return list.slice().sort((a, b) => { const x = sc.v(a), y = sc.v(b); if (x == null) return 1; if (y == null) return -1; return (x - y) * dir; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, all, st, grp, cl, sk, dir]);

  if (data === "error") return <div className="wrap"><div className="err-box" role="alert"><b>KBO 데이터를 불러오지 못했습니다.</b><br />서버로 열었는지 확인해 주세요.</div></div>;
  if (!meta) return <div className="wrap"><p className="sub">불러오는 중...</p></div>;

  const shown = out.slice(0, 200);
  const activeRule = rules.find(r => r.id === st.rule);
  const sortBy = k => upd(st.sort === k ? { dir: -st.dir } : { sort: k, dir: LOW_FIRST.includes(k) ? 1 : -1 });
  const start = pid => {
    Store.saveWizard({ mode: "record", source: "site", type: st.type, season: 2026, target: pid, teams: [], metrics: st.type === "batter" ? ["AVG", "OPS", "HR"] : ["ERA", "WHIP", "K9"] });
    navigate("/analyze#3");
  };

  return (
    <div className="wrap">
      <div className="result-head"><h1>선수 순위</h1><p className="sub">KBO 2026 정규시즌 실제 기록입니다. 열 이름을 누르면 그 기준으로 정렬됩니다.</p></div>
      <div className="rk-tabs" role="tablist">
        {[["pitcher", "투수 순위"], ["batter", "타자 순위"]].map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={st.type === t} onClick={() => setSt({ ...initialState, type: t, team: st.team, scope: st.scope, q: st.q })}>{label}</button>
        ))}
      </div>

      <section className="rk-filter">
        <div className="rk-row">
          <label>팀
            <select value={st.team} onChange={e => upd({ team: e.target.value })}>
              <option value="">전체</option>{meta.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></label>
          <label>범위
            <select value={st.scope} onChange={e => upd({ scope: e.target.value, grp: null })}>
              <option value="q">규정 채운 선수({st.type === "batter" ? `타석 ${meta.qualify.batterPa}↑` : `${Math.round(meta.qualify.pitcherOuts / 3)}이닝↑`})</option>
              <option value="all">전체 선수</option>
            </select></label>
          {st.type === "pitcher" && (
            <label>보직
              <select value={st.role} onChange={e => upd({ role: e.target.value })}><option value="">전체</option><option>선발</option><option>구원</option></select></label>
          )}
          <label>최소 {st.type === "batter" ? "타석" : "이닝"}
            <input type="number" min="0" step="10" value={st.min || ""} placeholder="0" onChange={e => upd({ min: Math.max(0, +e.target.value || 0) })} /></label>
          <label>이름
            <input type="search" value={st.q} placeholder="선수 이름" onChange={e => upd({ q: e.target.value.trim() })} /></label>
        </div>

        <div className="rk-chips" aria-label="유형">
          {rules.map(r => <button key={r.id} type="button" className={"chip" + (st.rule === r.id ? " on" : "")} title={r.rule} onClick={() => upd({ rule: st.rule === r.id ? "" : r.id })}>{r.t}</button>)}
          {st.rule && <button type="button" className="chip clr" onClick={() => upd({ rule: "" })}>유형 해제</button>}
        </div>
        {activeRule && <p className="note">{activeRule.rule}인 선수만 보여 줍니다. 기준 숫자는 이 사이트에서 정한 값입니다.</p>}

        {cl && (
          <div className="rk-cl">
            <b>자동 유형(군집)</b> <small>{cl.n}명을 {cl.feats.join("·")}만으로 {cl.k}개로 나눈 결과예요.</small>
            <div className="rk-chips">
              {cl.groups.map(g => <button key={g.j} type="button" className={"chip cl" + (grp === g.j ? " on" : "")} onClick={() => upd({ grp: grp === g.j ? null : g.j })}><i className="dot" style={{ background: CL_COLORS[g.j % CL_COLORS.length] }} />{g.name} <small>{g.n}명</small></button>)}
              {grp != null && <button type="button" className="chip clr" onClick={() => upd({ grp: null })}>군집 해제</button>}
            </div>
            <ClusterMap cl={cl} grp={grp} onPick={g => upd({ grp: grp === g ? null : g })} />
            {grp != null && <p className="note">이 군집의 평균: {cl.feats.map((f, q) => `${f} ${fmtFeat(f, cl.groups[grp].avg[q])}`).join(", ")}</p>}
            <p className="note">군집 이름은 평균보다 뚜렷이 높거나(↑) 낮은(↓) 지표를 나열한 것이고, 고정된 유형명이 아닙니다. 군집이 얼마나 뚜렷한지 나타내는 실루엣 점수는 <b>{cl.sil.toFixed(2)}</b>입니다(0.5 이상이면 뚜렷, 0.25 아래면 억지로 나눈 구조일 수 있음).</p>
          </div>
        )}
      </section>

      <section className="sec">
        <p className="sub">{out.length}명{out.length > shown.length ? ` 중 상위 ${shown.length}명` : ""}. 이름을 누르면 그 선수 분석을 시작합니다.</p>
        <div className="table-wrap">
          <table className="rk">
            <thead><tr><th>#</th><th>선수</th><th>팀</th>
              {cols.map(c => <th key={c.k} className="srt" aria-sort={sk === c.k ? (dir > 0 ? "ascending" : "descending") : undefined}><button type="button" onClick={() => sortBy(c.k)}>{c.t}{sk === c.k ? (dir > 0 ? " ▲" : " ▼") : ""}</button></th>)}
            </tr></thead>
            <tbody>
              {shown.map((s, i) => (
                <tr key={s.pid}>
                  <td>{i + 1}</td>
                  <td><button type="button" className="nm-btn" onClick={() => start(s.pid)}>{s.name}</button> <small className="muted">{s.pos}</small>{!qual(s) && <small className="muted"> (규정 미달)</small>}</td>
                  <td>{s.team}</td>
                  {cols.map(c => <td key={c.k} className={c.k === sk ? "hl" : undefined}>{c.f(c.v(s))}</td>)}
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={cols.length + 3}>조건에 맞는 선수가 없습니다. 조건을 줄여 보세요.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="note">컨택%·Chase%·헛스윙%는 투구 위치 기록으로 계산한 값입니다(존 안: 좌우 홈플레이트 폭 안, 위아래 타자별 존 안). 자세한 뜻은 지표 설명을 보세요.</p>
      </section>
    </div>
  );
}
