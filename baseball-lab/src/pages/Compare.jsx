import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Api } from "../lib/api.js";
import { Store } from "../lib/storage.js";
import { qualFor, teamLabel } from "../lib/season.js";
import { buildCompare, CMP_COLORS, LEAD } from "../lib/compare.js";
import { generate, fileName } from "../lib/report.js";
import PlayerCombo from "../components/PlayerCombo.jsx";
import { useScene } from "../context/SceneContext.jsx";
import { useToast } from "../context/ToastContext.jsx";

const KEYS = ["a", "b", "c", "d"];

function Chart({ g, label }) {
  if (!g) return null;
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={label}>
      {g.yt.map(t => <g key={t.y}><line x1={g.L} x2={g.W - g.R} y1={t.y} y2={t.y} className="fc-grid" /><text x={g.L - 6} y={t.y + 4} textAnchor="end" className="fc-tick">{t.label}</text></g>)}
      {g.bandPaths.map((b, i) => <path key={i} d={b.d} fill={b.color} opacity=".45" />)}
      {g.paths.map(p => <path key={p.name} d={p.d} fill="none" stroke={p.color} strokeWidth={p.width} strokeDasharray={p.dash} strokeLinejoin="round" />)}
      {g.dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.hollow ? "#fff" : d.color} stroke={d.color} strokeWidth="1.6"><title>{d.title}</title></circle>)}
      {g.xt.map(t => <text key={t.label} x={t.x} y={g.H - 10} textAnchor="middle" className="fc-tick">{t.label}</text>)}
    </svg>
  );
}
const Legend = ({ names }) => <p className="legend">{names.map((n, i) => <span key={n}><i style={{ background: CMP_COLORS[i], marginLeft: i ? 12 : 0 }} />{n} </span>)}</p>;

/** 선수 비교(2~4명): 같은 종류끼리(투수는 같은 보직끼리) 리그 백분위로 나란히 본다. 비교 결과는 분석 기록에 저장할 수 있다. */
export default function Compare() {
  useScene("stadium");
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const type = sp.get("type") === "pitcher" ? "pitcher" : "batter";
  const pids = KEYS.map(k => sp.get(k) || "");
  const [shown, setShown] = useState(() => Math.max(2, ...pids.map((p, i) => (p ? i + 1 : 0))));
  const set = patch => { const n = new URLSearchParams(sp); Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); setSp(n, { replace: true }); };
  const [data, setData] = useState(null), [fail, setFail] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => { document.title = "선수 비교 | 야구 분석 랩"; }, []);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const meta = await Api.meta(), season = meta.seasons[0];
        const [rows, career, fc] = await Promise.all([type === "batter" ? Api.batters(season) : Api.pitchers(season), Api.career(), Api.forecast()]);
        if (live) setData({ meta, season, rows, career, fc });
      } catch (e) { if (live) setFail(true); }
    })();
    return () => { live = false; };
  }, [type]);

  const teamName = id => (data ? teamLabel(data.meta, id) : id);
  const chosen = pids.slice(0, shown);
  const first = data?.rows.find(r => r.pid === chosen.find(Boolean));
  const poolFor = i => (data ? data.rows.filter(r => !chosen.some((p, j) => j !== i && p === r.pid) && (type === "batter" || !first || r.pos === first.pos)) : []);
  const ready = data && chosen.every(Boolean) && chosen.every(p => data.rows.some(r => r.pid === p)) && (type === "batter" || chosen.every(p => data.rows.find(r => r.pid === p).pos === first.pos));
  const cmp = useMemo(() => (ready ? buildCompare(type, data.rows, chosen, data.meta, data.career, data.fc) : null), [ready, type, data, chosen.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const mismatch = type === "pitcher" && data && chosen.every(Boolean) && !ready;
  const C = cmp?.C;

  const record = () => ({
    id: Store.newId(), createdAt: new Date().toISOString(), mode: "record", source: "site", type: "compare", season: data.season,
    title: `${cmp.names.join(" · ")} 선수 비교`, params: { target: "", teams: [], metrics: [] },
    result: { kind: "compare", ptype: type, pids: chosen, path: `/compare?type=${type}&${chosen.map((p, i) => `${KEYS[i]}=${p}`).join("&")}`, names: cmp.names, cmp: { summary: cmp.summary, names: cmp.names, type, profile: cmp.profile, items: cmp.items.map(it => ({ group: it.group, label: it.label, en: it.en, vals: it.vals, lead: it.lead })), unit: C.stat } },
  });
  const save = () => { Store.add(record()); toast("비교를 분석 기록에 저장했습니다."); };
  const savePdf = async () => {
    setBusy(true);
    try { const rec = record(); rec.result.charts = { age: cmp.age, fut: cmp.fut, fcs: cmp.fcs, colors: CMP_COLORS, digits: C.digits }; await generate(rec, "save"); toast(`${fileName(rec)} 파일을 저장했습니다.`); }
    catch (err) { toast(err && err.message ? err.message : "PDF를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요."); }
    finally { setBusy(false); }
  };

  const groups = cmp ? [...new Set(cmp.items.map(i => i.group))] : [];
  return (
    <div className="wrap">
      <div className="result-head"><h1>선수 비교</h1><p className="sub">같은 종류의 선수 2~4명을 리그 백분위로 나란히 비교합니다. 투수는 선발은 선발끼리, 불펜은 불펜끼리 비교해요.</p></div>
      {fail && <div className="err-box" role="alert">기록을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.</div>}
      <div className="seg2" role="group" aria-label="비교할 선수 종류" style={{ margin: "14px 0 4px", maxWidth: 260 }}>
        {["batter", "pitcher"].map(t => <button key={t} type="button" aria-pressed={type === t} onClick={() => { set({ type: t, a: "", b: "", c: "", d: "" }); setShown(2); }}>{t === "batter" ? "타자" : "투수"}</button>)}
      </div>
      {data && (
        <div className="cmp-pick">
          {chosen.map((p, i) => (
            <div key={i}>
              <PlayerCombo id={"cmp-" + KEYS[i]} label={`${i + 1}번째 선수`} rows={poolFor(i)} type={type} value={p} qualify={qualFor(data.meta, data.season)} teamName={teamName} onPick={v => set({ [KEYS[i]]: v })} />
              {i >= 2 && <button className="linkbtn quiet" type="button" onClick={() => { set({ [KEYS[i]]: "" }); setShown(n => Math.max(2, n - 1)); }}>이 선수 빼기</button>}
            </div>
          ))}
          {shown < 4 && <div className="cmp-add"><button className="btn" type="button" onClick={() => setShown(n => n + 1)}>선수 추가 ({shown}/4명)</button></div>}
        </div>
      )}
      {!cmp && data && <p className="sub">{mismatch ? "선발 투수와 불펜 투수는 던지는 이닝과 역할이 달라 비교하지 않아요. 같은 역할의 선수를 골라 주세요." : "선수를 모두 고르면 비교 결과가 나타납니다."}</p>}
      {cmp && <>
        <div className="cmp-top" style={{ "--n": cmp.names.length }}>
          {cmp.reps.map((r, i) => { const row = data.rows.find(x => x.pid === chosen[i]); return (
            <div key={i} className="cmp-card" style={{ borderTop: `4px solid ${CMP_COLORS[i]}` }}><h3>{r.subject.name}</h3><p>{r.subject.team} · {r.subject.pos} · {data.season} 시즌 · {type === "batter" ? `${row.pa}타석` : `${(row.outs / 3).toFixed(1)}이닝`}{r.qualified ? "" : " · 규정 미달"}</p></div>); })}
        </div>
        <div className="act-row" style={{ marginTop: 0 }}>
          <button className="btn pri" type="button" onClick={save}>비교 저장</button>
          <button className="btn" type="button" disabled={busy} aria-busy={busy} onClick={savePdf}>{busy ? "보고서를 만드는 중" : "PDF로 저장"}</button>
        </div>
        <section className="sec" style={{ marginTop: 0 }}><h2>한눈에 보기</h2>
          <p className="cmp-sum">{cmp.summary}</p>
          <div className="cmp-bars">
            {cmp.profile.map(g => (
              <div className="cmp-bar4" key={g.name}><b>{g.name}</b>
                <div className="cmp-bars-in">{g.scores.map((s, i) => <div className="cmp-row" key={i} role="img" aria-label={`${g.name} ${cmp.names[i]} ${s}점`}><div className="cmp-track"><i style={{ width: s + "%", background: CMP_COLORS[i] }} /></div><span>{s}</span></div>)}</div></div>
            ))}
          </div>
          <Legend names={cmp.names} /><p className="note">영역별 리그 백분위 평균입니다(높을수록 좋음).</p>
        </section>
        <section className="sec"><h2>지표별 비교</h2>
          <div className="table-wrap"><table className="cmp-t">
            <thead><tr><th>지표</th>{cmp.names.map((n, i) => <th key={i} style={{ color: CMP_COLORS[i] }}>{n}</th>)}</tr></thead>
            <tbody>{groups.map(g => [<tr key={g} className="gh"><td colSpan={cmp.names.length + 1}>{g}</td></tr>, ...cmp.items.filter(x => x.group === g).map(it => (
              <tr key={it.key}><td>{it.label}{it.label !== it.en ? ` ${it.en}` : ""}</td>{it.vals.map((v, i) => <td key={i} className={it.lead === i ? "lead" : ""} style={it.lead === i ? { color: CMP_COLORS[i] } : undefined}>{v.display}<small>{v.pct == null ? "" : `상위 ${100 - v.pct}%`}</small></td>)}</tr>))])}</tbody></table></div>
          <p className="note">굵은 색 글씨는 리그 백분위가 두 번째로 좋은 선수보다 {LEAD}점 이상 앞선 선수입니다(비슷하면 표시하지 않아요). 순위와 백분위는 각자 같은 종류의 규정 충족 선수 기준이라, 선발과 불펜 같은 다른 집단과는 비교하지 않았습니다.</p>
        </section>
        {cmp.age && <section className="sec fc-box"><h2>나이별 커리어 비교</h2>
          <p className="sub">같은 나이일 때 {C.stat}을 비교합니다. {type === "batter" ? "50타석" : "20이닝"} 미만 시즌은 뺐어요. {C.better === "low" ? "ERA는 낮을수록 좋아요." : ""}</p>
          <Legend names={cmp.names} /><figure className="fc-chart"><Chart g={cmp.age} label={`나이별 ${C.stat} 비교`} /></figure></section>}
        {cmp.fut && <section className="sec fc-box"><h2>앞으로 5년 예측 비교 <small className="tag">실험적 기능</small></h2>
          <p className="sub">선은 예측값, 옅은 띠는 실제 값이 들어올 가능성이 80%인 범위입니다. 띠가 많이 겹치면 예측만으로는 우열을 가리기 어렵다는 뜻이에요.</p>
          <Legend names={cmp.names} /><figure className="fc-chart"><Chart g={cmp.fut} label="앞으로 5년 예측 비교" /></figure>
          <div className="table-wrap"><table className="tf-t"><thead><tr><th>시즌</th>{cmp.names.map((n, i) => <th key={i}>{n}</th>)}</tr></thead><tbody>
            {cmp.fcs[0].pred.map((q, k) => <tr key={q.year}><td>{q.year}</td>{cmp.fcs.map((f, i) => { const x = f.pred[k]; return <td key={i}>{x.mid.toFixed(C.digits)} <small>({x.lo.toFixed(C.digits)}~{x.hi.toFixed(C.digits)}, 현역 {Math.round(x.active * 100)}%)</small></td>; })}</tr>)}</tbody></table></div>
          <p className="note">은퇴 시기 예측: {cmp.names.map((n, i) => `${n} ${cmp.fcs[i].retire_by ? `${cmp.fcs[i].retire_by}세` : "5년 안에는 높게 유지"}`).join(", ")}. 예측의 정확도와 한계는 각 선수의 분석 결과 화면에 있습니다.</p></section>}
        {!cmp.fut && <p className="note">선수 중 일부는 예측 자료가 없어 예측 비교는 보여 주지 않습니다.</p>}
      </>}
    </div>
  );
}
