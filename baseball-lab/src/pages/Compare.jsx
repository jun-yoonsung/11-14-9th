import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Api } from "../lib/api.js";
import { build } from "../lib/detail.js";
import { CAREER } from "../lib/career.js";
import { plot } from "../lib/chart.js";
import PlayerCombo from "../components/PlayerCombo.jsx";
import { useScene } from "../context/SceneContext.jsx";

const CA = "#5e6ad2", CB = "#d0312d";
const LEAD = 8;   // 백분위 차이가 이 값 이상이면 "앞선다"고 본다

/** 두 선수의 영역별 점수와 지표를 비교한 요약 문장(코드가 계산값으로 만든다) */
function summarize(a, b) {
  const lead = (x, y) => x.profile.filter((p, i) => p.score != null && y.profile[i].score != null && p.score - y.profile[i].score >= LEAD).map(p => p.name);
  const la = lead(a, b), lb = lead(b, a);
  const cnt = { a: 0, b: 0, even: 0 };
  a.items.forEach((it, i) => { const o = b.items[i]; if (it.pct == null || o.pct == null) return; const d = it.pct - o.pct; if (d >= LEAD) cnt.a++; else if (-d >= LEAD) cnt.b++; else cnt.even++; });
  const nm = r => r.subject.name;
  const first = (r, l) => (l.length ? `${nm(r)} 선수는 ${l.join(", ")} 영역에서 앞서고` : `${nm(r)} 선수는 뚜렷하게 앞서는 영역이 없고`);
  const last = (r, l) => (l.length ? `${nm(r)} 선수는 ${l.join(", ")} 영역에서 앞섭니다.` : `${nm(r)} 선수도 뚜렷하게 앞서는 영역이 없습니다.`);
  return `${first(a, la)} ${last(b, lb)} 지표 ${cnt.a + cnt.b + cnt.even}개 중 ${nm(a)} ${cnt.a}개, ${nm(b)} ${cnt.b}개가 리그 백분위 ${LEAD}점 이상 앞서고 ${cnt.even}개는 비슷합니다.`;
}

function Chart({ g, label }) {
  if (!g) return null;
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={label}>
      {g.yt.map(t => <g key={t.y}><line x1={g.L} x2={g.W - g.R} y1={t.y} y2={t.y} className="fc-grid" /><text x={g.L - 6} y={t.y + 4} textAnchor="end" className="fc-tick">{t.label}</text></g>)}
      {g.bandPaths.map((b, i) => <path key={i} d={b.d} fill={b.color} opacity=".35" />)}
      {g.paths.map(p => <path key={p.name} d={p.d} fill="none" stroke={p.color} strokeWidth={p.width} strokeDasharray={p.dash} strokeLinejoin="round" />)}
      {g.dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.hollow ? "#fff" : d.color} stroke={d.color} strokeWidth="1.6"><title>{d.title}</title></circle>)}
      {g.xt.map(t => <text key={t.label} x={t.x} y={g.H - 10} textAnchor="middle" className="fc-tick">{t.label}</text>)}
    </svg>
  );
}

/** 선수 1대1 비교: 같은 종류(타자/투수, 투수는 선발/불펜)끼리 리그 백분위로 비교한다 */
export default function Compare() {
  useScene("stadium");
  const [sp, setSp] = useSearchParams();
  const type = sp.get("type") === "pitcher" ? "pitcher" : "batter", pa = sp.get("a") || "", pb = sp.get("b") || "";
  const set = patch => { const n = new URLSearchParams(sp); Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); setSp(n, { replace: true }); };
  const [data, setData] = useState(null), [fail, setFail] = useState(false);
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

  const teamName = id => ((data?.meta.teams || []).find(t => t.id === id) || {}).name || id;
  const A = data?.rows.find(r => r.pid === pa), B = data?.rows.find(r => r.pid === pb);
  const poolB = useMemo(() => (data ? data.rows.filter(r => r.pid !== pa && (type === "batter" || !A || r.pos === A.pos)) : []), [data, pa, A, type]);
  const poolA = useMemo(() => (data ? data.rows.filter(r => r.pid !== pb && (type === "batter" || !B || r.pos === B.pos)) : []), [data, pb, B, type]);
  const rep = useMemo(() => {
    if (!data || !A || !B || (type === "pitcher" && A.pos !== B.pos)) return null;
    const mk = p => build(type, data.rows, p, data.meta.qualify, data.meta, [], type === "pitcher" ? [] : null);
    return { a: mk(pa), b: mk(pb) };
  }, [data, A, B, pa, pb, type]);

  const C = CAREER[type], isBat = type === "batter";
  const charts = useMemo(() => {
    if (!rep || !data) return null;
    const ageSeries = (pid, color, name) => {
      const rows = data.career?.players?.[type]?.[pid] || [];
      return { name, color, width: 2.2, r: 3, pts: rows.filter(r => r[C.vol] >= C.minShow && r[C.main] != null && r[1] != null).map(r => ({ x: r[1], y: r[C.main], t: `${name} ${r[1]}세(${r[0]}) ${C.stat} ${Number(r[C.main]).toFixed(C.digits)}` })) };
    };
    const sa = ageSeries(pa, CA, rep.a.subject.name), sb = ageSeries(pb, CB, rep.b.subject.name);
    const age = sa.pts.length && sb.pts.length ? plot({ series: [sa, sb], yDigits: C.digits, xFmt: v => `${v}세` }) : null;
    const fa = data.fc?.players?.[pa], fb = data.fc?.players?.[pb];
    let fut = null;
    if (fa && fb) {
      const pts = (p, name) => [{ x: data.fc.meta.base_season, y: p.now, t: `${name} 올해 ${p.now.toFixed(C.digits)}` }, ...p.pred.map(q => ({ x: q.year, y: q.mid, t: `${name} ${q.year} 예측 ${q.mid.toFixed(C.digits)} (${q.lo.toFixed(C.digits)}~${q.hi.toFixed(C.digits)})` }))];
      const band = (p, color) => ({ color, pts: [{ x: data.fc.meta.base_season, lo: p.now, hi: p.now }, ...p.pred.map(q => ({ x: q.year, lo: q.lo, hi: q.hi }))] });
      fut = plot({ series: [{ name: rep.a.subject.name, color: CA, width: 2.2, pts: pts(fa, rep.a.subject.name) }, { name: rep.b.subject.name, color: CB, width: 2.2, pts: pts(fb, rep.b.subject.name) }], bands: [band(fa, CA), band(fb, CB)], yDigits: C.digits });
    }
    return { age, fut, fa, fb };
  }, [rep, data, pa, pb, type]);

  const groups = rep ? [...new Set(rep.a.items.map(i => i.group))] : [];
  const mismatch = type === "pitcher" && A && B && A.pos !== B.pos;

  return (
    <div className="wrap">
      <div className="result-head"><h1>선수 비교</h1><p className="sub">같은 종류의 선수 두 명을 리그 백분위로 나란히 비교합니다. 투수는 선발은 선발끼리, 불펜은 불펜끼리 비교해요.</p></div>
      {fail && <div className="err-box" role="alert">기록을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.</div>}
      <div className="seg2" role="group" aria-label="비교할 선수 종류" style={{ margin: "14px 0 4px" }}>
        {["batter", "pitcher"].map(t => <button key={t} type="button" aria-pressed={type === t} onClick={() => set({ type: t, a: "", b: "" })}>{t === "batter" ? "타자" : "투수"}</button>)}
      </div>
      {data && (
        <div className="cmp-pick">
          <PlayerCombo id="cmp-a" label="첫 번째 선수" rows={poolA} type={type} value={pa} qualify={data.meta.qualify} teamName={teamName} onPick={v => set({ a: v })} />
          <PlayerCombo id="cmp-b" label="두 번째 선수" rows={poolB} type={type} value={pb} qualify={data.meta.qualify} teamName={teamName} onPick={v => set({ b: v })} />
        </div>
      )}
      {!rep && data && <p className="sub">{mismatch ? "선발 투수와 불펜 투수는 던지는 이닝과 역할이 달라 비교하지 않아요. 같은 역할의 선수를 골라 주세요." : "두 선수를 모두 고르면 비교 결과가 나타납니다."}</p>}
      {rep && <>
        <div className="cmp-top">
          {[["a", rep.a, A], ["b", rep.b, B]].map(([k, r, row]) => (
            <div key={k} className={"cmp-card " + k}><h3>{r.subject.name}</h3><p>{r.subject.team} · {r.subject.pos} · {data.season} 시즌 · {isBat ? `${row.pa}타석` : `${(row.outs / 3).toFixed(1)}이닝`}{r.qualified ? "" : " · 규정 미달"}</p></div>
          ))}
        </div>
        <section className="sec" style={{ marginTop: 0 }}><h2>한눈에 보기</h2>
          <p className="cmp-sum">{summarize(rep.a, rep.b)}</p>
          <div className="cmp-bars">
            {rep.a.profile.map((p, i) => { const q = rep.b.profile[i]; return p.score == null || q.score == null ? null : (
              <div className="cmp-bar" key={p.name}><b>{p.name}</b><div className="cmp-track" role="img" aria-label={`${p.name} ${rep.a.subject.name} ${p.score}점, ${rep.b.subject.name} ${q.score}점`}><i className="a" style={{ width: p.score + "%", background: CA }} /><i className="b" style={{ width: q.score + "%", background: CB }} /></div><span>{p.score} / {q.score}</span></div>); })}
          </div>
          <p className="legend"><i style={{ background: CA }} />{rep.a.subject.name} <i style={{ background: CB, marginLeft: 12 }} />{rep.b.subject.name}. 영역별 리그 백분위 평균(높을수록 좋음)</p>
        </section>
        <section className="sec"><h2>지표별 비교</h2>
          <div className="table-wrap"><table className="cmp-t">
            <thead><tr><th>지표</th><th>{rep.a.subject.name}</th><th>{rep.b.subject.name}</th></tr></thead>
            <tbody>{groups.map(g => [<tr key={g} className="gh"><td colSpan={3}>{g}</td></tr>, ...rep.a.items.map((it, i) => ({ it, o: rep.b.items[i] })).filter(x => x.it.group === g).map(({ it, o }) => {
              const d = it.pct != null && o.pct != null ? it.pct - o.pct : 0, la = d >= LEAD, lb = -d >= LEAD;
              return <tr key={it.key}><td>{it.label}{it.label !== it.en ? ` ${it.en}` : ""}</td>
                <td className={la ? "lead a" : ""}>{it.display}<small>{it.pct == null ? "" : `상위 ${100 - it.pct}%`}</small></td>
                <td className={lb ? "lead b" : ""}>{o.display}<small>{o.pct == null ? "" : `상위 ${100 - o.pct}%`}</small></td></tr>;
            })])}</tbody></table></div>
          <p className="note">굵은 색 글씨는 리그 백분위가 {LEAD}점 이상 앞선 쪽입니다(비슷하면 표시하지 않아요). 순위와 백분위는 각자 같은 종류의 규정 충족 선수 기준이라, 선발과 불펜 같은 다른 집단과는 비교하지 않았습니다.</p>
        </section>
        {charts?.age && <section className="sec fc-box"><h2>나이별 커리어 비교</h2>
          <p className="sub">같은 나이일 때 {C.stat}을 비교합니다. {isBat ? "50타석" : "20이닝"} 미만 시즌은 뺐어요. {C.better === "low" ? "ERA는 낮을수록 좋아요." : ""}</p>
          <figure className="fc-chart"><Chart g={charts.age} label={`${rep.a.subject.name}와 ${rep.b.subject.name}의 나이별 ${C.stat}`} /></figure></section>}
        {charts?.fut && <section className="sec fc-box"><h2>앞으로 5년 예측 비교 <small className="tag">실험적 기능</small></h2>
          <p className="sub">선은 예측값, 옅은 띠는 실제 값이 들어올 가능성이 80%인 범위입니다. 두 띠가 많이 겹치면 예측만으로는 우열을 가리기 어렵다는 뜻이에요.</p>
          <figure className="fc-chart"><Chart g={charts.fut} label="두 선수의 앞으로 5년 예측" /></figure>
          <div className="table-wrap"><table className="tf-t"><thead><tr><th>시즌</th><th>{rep.a.subject.name}</th><th>{rep.b.subject.name}</th></tr></thead><tbody>
            {charts.fa.pred.map((q, i) => { const r = charts.fb.pred[i]; return <tr key={q.year}><td>{q.year}</td><td>{q.mid.toFixed(C.digits)} <small>({q.lo.toFixed(C.digits)}~{q.hi.toFixed(C.digits)}, 현역 {Math.round(q.active * 100)}%)</small></td><td>{r.mid.toFixed(C.digits)} <small>({r.lo.toFixed(C.digits)}~{r.hi.toFixed(C.digits)}, 현역 {Math.round(r.active * 100)}%)</small></td></tr>; })}</tbody></table></div>
          <p className="note">은퇴 시기 예측: {rep.a.subject.name} {charts.fa.retire_by ? `${charts.fa.retire_by}세` : "5년 안에는 높게 유지"}, {rep.b.subject.name} {charts.fb.retire_by ? `${charts.fb.retire_by}세` : "5년 안에는 높게 유지"}. 예측의 정확도와 한계는 각 선수의 분석 결과 화면에 있습니다.</p></section>}
        {data && !charts?.fut && <p className="note">두 선수 중 한 명은 예측 자료가 없어 예측 비교는 보여 주지 않습니다.</p>}
      </>}
    </div>
  );
}
