import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Api } from "../lib/api.js";
import { Store } from "../lib/storage.js";
import { TYPES, MAX_METRICS, analyzePlayer, analyzeTeams } from "../lib/stats.js";
import { build } from "../lib/detail.js";
import PlayerCombo from "../components/PlayerCombo.jsx";
import { useScene } from "../context/SceneContext.jsx";
import { useToast } from "../context/ToastContext.jsx";

const Ic = ({ children, stroke = "#1d3fbb" }) => <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" aria-hidden="true">{children}</svg>;
const icTable = <Ic><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M9.5 9.5v10" /></Ic>;
const icVideo = <Ic stroke="#5c667d"><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10.5l5-3v9l-5-3z" /></Ic>;
const icData = <Ic><ellipse cx="12" cy="6" rx="7.5" ry="2.8" /><path d="M4.5 6v12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" /></Ic>;
const icUpload = <Ic stroke="#5c667d"><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M4.5 15v3.5a1.5 1.5 0 001.5 1.5h12a1.5 1.5 0 001.5-1.5V15" /></Ic>;

const Steps = ({ n }) => (
  <div className="steps" aria-label="진행 단계">
    {["분석 방식", "데이터 출처", "분석 설정"].map((s, i) => <span key={s} className={i + 1 < n ? "done" : i + 1 === n ? "on" : ""} aria-current={i + 1 === n ? "step" : undefined}>{i + 1}. {s}</span>)}
  </div>
);

/** 데이터 분석: ① 분석 방식 → ② 데이터 출처 → ③ 분석 설정 → 결과 */
export default function Analyze() {
  const navigate = useNavigate();
  const loc = useLocation();
  const toast = useToast();

  // ---------- 상태: 고르던 값은 브라우저에 저장해 두어 새로고침해도 이어진다 ----------
  const [w, setW] = useState(() => {
    const v = Store.wizard();
    const want = new URLSearchParams(loc.search).get("type");
    if (TYPES[want] && v.type !== want) { v.type = want; v.target = ""; v.teams = []; v.metrics = TYPES[want].defaults.slice(); }
    if (!TYPES[v.type]) v.type = "batter";
    if (!v.season) v.season = 2026;
    if (!Array.isArray(v.metrics)) v.metrics = TYPES[v.type].defaults.slice();
    if (!Array.isArray(v.teams)) v.teams = [];
    return v;
  });
  const update = patch => setW(prev => { const next = { ...prev, ...patch }; Store.saveWizard(next); return next; });
  useEffect(() => { Store.saveWizard(w); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  let step = Number((loc.hash || "#1").slice(1)) || 1;
  if (step > 1 && w.mode !== "record") step = 1;
  if (step > 2 && w.source !== "site") step = 2;
  const go = n => { setErrors({}); navigate({ pathname: "/analyze", hash: "#" + n }, { replace: true }); window.scrollTo(0, 0); };

  useScene(step === 3 && (w.type === "batter" || w.type === "pitcher") ? w.type : "stadium");   // 타자·투수를 고르면 그 장면으로

  const [meta, setMeta] = useState(null), [fail, setFail] = useState(false);
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => { Api.meta().then(setMeta).catch(() => setFail(true)); }, []);
  useEffect(() => {
    if (step !== 3 || !meta) return;
    let dead = false;
    (w.type === "batter" ? Api.batters(w.season) : w.type === "pitcher" ? Api.pitchers(w.season) : Api.teams(w.season)).then(r => { if (!dead) setRows(r); });
    return () => { dead = true; };
  }, [step, w.type, w.season, meta]);
  useEffect(() => { document.title = `데이터 분석 ${step}/3 | 야구 분석 랩`; }, [step]);

  const teamName = useCallback(id => ((meta?.teams || []).find(t => t.id === id) || {}).name || id, [meta]);

  if (fail) return <div className="wrap"><div className="err-box" role="alert"><b>KBO 데이터를 불러오지 못했습니다.</b><br />서버(localhost 등)로 열었는지 확인해 주세요.</div></div>;
  if (!meta) return <div className="wrap"><p className="sub">불러오는 중...</p></div>;

  const ty = TYPES[w.type];

  // ---------- 분석 실행 ----------
  async function run() {
    const e = {};
    if (w.type === "team") { if (w.teams.length < 2) e.target = "팀을 2개 이상 선택해 주세요."; }
    else if (!w.target) e.target = `${ty.short}를 선택해 주세요.`;
    if (!w.metrics.length) e.metric = "지표를 1개 이상 선택해 주세요.";
    setErrors(e);
    if (e.target || e.metric) { setTimeout(() => document.querySelector(".field.err, .err-msg:not(:empty)")?.scrollIntoView({ block: "center" }), 0); return; }
    setBusy(true);
    let result, title;
    if (w.type === "team") {
      result = analyzeTeams(rows, w.teams, w.metrics);
      title = `${w.teams.length}개 팀 ${w.season} 팀 비교`;
    } else {
      result = analyzePlayer(w.type, rows, w.target, w.metrics, meta.qualify);
      result.teamName = teamName(result.subject.team);
      try {   // 상세 보고서: 유형(타자·투수)에 맞는 항목을 만들어 함께 저장
        const monthly = await Api.monthly(w.type, w.target);
        const mix = w.type === "pitcher" ? await Api.pitchmix(w.target) : null;
        result.report = build(w.type, rows, w.target, meta.qualify, meta, monthly, mix);
      } catch (err) { console.warn("상세 보고서를 만들지 못했습니다", err); }
      title = `${result.subject.name} ${w.season} ${ty.label}`;
    }
    const rec = {
      id: Store.newId(), createdAt: new Date().toISOString(), mode: "record", source: "site", type: w.type, season: w.season, title,
      params: { target: w.target || "", teams: w.teams.slice(), metrics: w.metrics.slice() }, result,
    };
    Store.add(rec);
    navigate(`/result/${encodeURIComponent(rec.id)}`);
  }

  const toggleMetric = k => {
    if (w.metrics.includes(k)) { update({ metrics: w.metrics.filter(x => x !== k) }); setErrors({}); }
    else if (w.metrics.length >= MAX_METRICS) setErrors({ metric: `지표는 최대 ${MAX_METRICS}개까지 고를 수 있어요.` });
    else { update({ metrics: [...w.metrics, k] }); setErrors({}); }
  };
  const toggleTeam = id => {
    if (w.teams.includes(id)) { update({ teams: w.teams.filter(x => x !== id) }); setErrors({}); }
    else if (w.teams.length >= 4) setErrors({ target: "팀은 최대 4개까지 고를 수 있어요." });
    else { update({ teams: [...w.teams, id] }); setErrors({}); }
  };

  // ---------- 화면 ----------
  if (step === 1) {
    return (
      <div className="wrap">
        <Steps n={1} />
        <div className="panel">
          <h1>어떤 데이터를 분석할까요?</h1>
          <button className={"option" + (w.mode === "record" ? " sel" : "")} type="button" onClick={() => { update({ mode: "record" }); go(2); }}>
            <span className="ic">{icTable}</span><span><b>기록 데이터</b><small>타율, 홈런, 평균자책점 같은 숫자 기록을 분석합니다</small></span></button>
          <button className="option off" type="button" aria-describedby="videoHint" onClick={() => { toast("영상 분석은 다음 버전에서 제공됩니다."); setErrors({ mode: "영상 분석은 다음 버전에서 제공됩니다. 기록 데이터를 선택해 주세요." }); }}>
            <span className="ic">{icVideo}</span><span><b>영상 데이터 <span className="pill">준비 중</span></b><small id="videoHint">투구 폼, 타구 궤적 분석은 다음 버전에서 제공됩니다</small></span></button>
          <div className="err-msg" role="alert">{errors.mode}</div>
          <div className="actions"><button className="btn pri grow" type="button" onClick={() => (w.mode === "record" ? go(2) : setErrors({ mode: "분석 방식을 선택해 주세요." }))}>다음</button></div>
        </div>
      </div>
    );
  }
  if (step === 2) {
    return (
      <div className="wrap">
        <Steps n={2} />
        <div className="panel">
          <h1>어떤 데이터로 분석할까요?</h1>
          <button className={"option" + (w.source === "site" ? " sel" : "")} type="button" onClick={() => { update({ source: "site" }); go(3); }}>
            <span className="ic">{icData}</span><span><b>사이트 데이터</b><small>{meta.league} {meta.seasons.slice().sort().join("·")} 정규시즌 {meta.teams.length}개 팀의 타자·투수·팀 기록 ({meta.range[0]} ~ {meta.range[1]})</small></span></button>
          <button className="option off" type="button" disabled aria-describedby="upHint">
            <span className="ic">{icUpload}</span><span><b>내 데이터 업로드 <span className="pill">다음 버전</span></b><small id="upHint">가지고 있는 기록 파일로 분석하는 기능은 다음 버전에서 제공됩니다</small></span></button>
          <div className="err-msg" role="alert">{errors.source}</div>
          <div className="actions">
            <button className="btn ghost" type="button" onClick={() => go(1)}>이전</button>
            <button className="btn pri grow" type="button" onClick={() => (w.source === "site" ? go(3) : setErrors({ source: "데이터 출처를 선택해 주세요." }))}>다음</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="wrap">
      <Steps n={3} />
      <div className="panel">
        <h1>무엇을 분석할까요?</h1>
        <div className="seg" role="group" aria-label="분석 종류">
          {Object.keys(TYPES).map(k => (
            <button key={k} type="button" aria-pressed={w.type === k} onClick={() => { if (w.type !== k) { update({ type: k, target: "", teams: [], metrics: TYPES[k].defaults.slice() }); setErrors({}); setRows([]); } }}>{TYPES[k].label}</button>
          ))}
        </div>
        <div className="row2">
          <div><label className="label" htmlFor="season">시즌</label>
            <select className="field" id="season" value={w.season} onChange={e => update({ season: Number(e.target.value) })}>{meta.seasons.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          {w.type === "team" ? (
            <div>
              <span className="label" id="tl">비교할 팀 <span className="count">{w.teams.length} / 4개</span></span>
              <div className="chips" role="group" aria-labelledby="tl">
                {rows.map(t => <button key={t.id} className="chip" type="button" aria-pressed={w.teams.includes(t.id)} onClick={() => toggleTeam(t.id)}>{t.name}</button>)}
              </div>
              <div className="err-msg" role="alert">{errors.target}</div>
            </div>
          ) : (
            <div>
              <PlayerCombo rows={rows} type={w.type} value={w.target} qualify={meta.qualify} teamName={teamName} hasError={!!errors.target} label={ty.short}
                onPick={pid => { update({ target: pid }); setErrors({}); }} />
              <p className="hint">{w.target ? "다른 선수를 보려면 칸을 눌러 새로 검색하세요. " : ""}타석이나 이닝이 많은 선수가 먼저 나옵니다. 규정 미달 선수는 순위 없이 참고용으로 분석됩니다.</p>
              <div className="err-msg" role="alert">{errors.target}</div>
            </div>
          )}
        </div>
        <div>
          <span className="label" id="ml">볼 지표 <span className="count">{w.metrics.length} / {MAX_METRICS}개</span></span>
          <div className="chips" role="group" aria-labelledby="ml">
            {ty.defs.map(d => <button key={d.key} className="chip" type="button" aria-pressed={w.metrics.includes(d.key)} title={d.how} onClick={() => toggleMetric(d.key)}>{d.label}{d.label !== d.en ? " " + d.en : ""}</button>)}
          </div>
          <div className="err-msg" role="alert">{errors.metric}</div>
          <p className="hint">지표 이름에 마우스를 올리면 계산 방법이 보여요.</p>
        </div>
        <div className="actions">
          <button className="btn ghost" type="button" onClick={() => go(2)}>이전</button>
          <button className="btn pri grow" type="button" disabled={busy} aria-busy={busy} onClick={run}>{busy ? "분석하는 중" : "분석하기"}</button>
        </div>
      </div>
    </div>
  );
}
