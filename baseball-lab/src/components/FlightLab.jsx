import { useEffect, useMemo, useRef, useState } from "react";
import { Api } from "../lib/api.js";
import { f1 } from "../lib/spray.js";
import { TYPE_COLORS, VIEWS, tcol, trajSvg, tunnelStats, tunnelSvg, flightTime, COUNTS, CG_LABEL, cgOf, typeProbs, zoneProbs, whiffProb, evidence, zoneProbSvg } from "../lib/flight.js";

const MIN_N = 10;
/** 투수 한 명의 공의 움직임(궤적 재생)·구종 비교(터널링)·다음 공 예측 (2026 시즌만) */
export default function FlightLab({ rec }) {
  const [d, setD] = useState(null);
  useEffect(() => { let on = true; Promise.all([Api.flight(), Api.traj()]).then(([f, t]) => on && setD({ f, t })); return () => { on = false; }; }, []);
  if (!d || !d.f || !d.t || rec.type !== "pitcher" || rec.season !== 2026) return null;
  const id = String(rec.params.target), fe = d.f.p[id], te = d.t.p[id];
  if (!fe || !te) return null;
  const types = d.f.meta.types;
  const means = Object.entries(te.m).map(([ti, v]) => ({ ti: +ti, t: types[+ti], n: v[0], m: v.slice(1) })).sort((a, b) => b.n - a.n);
  const each = te.e.map(r => ({ ti: r[0], t: types[r[0]], m: r.slice(1) }));
  return (
    <section className="sec rep spray" id="r-flight">
      <h2>공의 움직임·구종 비교·다음 공 예측 (2026 시즌)</h2>
      <p className="sub">투구 추적 장비가 잰 공의 궤적으로 공이 어떻게 날아가는지 그리고, 구종끼리 얼마나 늦게 갈라지는지 비교하고, 이 투수가 다음에 어떤 공을 어디로 던질지를 예측합니다. 궤적 계산은 속도·가속도 측정값에서 나온 근사라 구장 보정 차이(±5cm 정도)가 있어요.</p>
      <Motion means={means} each={each} />
      <Tunnel means={means} />
      <Predict f={fe} meta={d.f.meta} />
    </section>
  );
}

function Motion({ means, each }) {
  const [view, setView] = useState("catcher"), [mode, setMode] = useState("mean"), [hidden, setHidden] = useState(() => new Set());
  const [speed, setSpeed] = useState(1), [t, setT] = useState(null), [playing, setPlaying] = useState(false);
  const raf = useRef(0), t0 = useRef(0);
  const shown = means.filter(x => !hidden.has(x.t) && x.n >= MIN_N);
  const maxFlight = Math.max(0.3, ...shown.map(x => flightTime(x.m) || 0));
  useEffect(() => {
    if (!playing) return;
    t0.current = performance.now();
    const tick = now => {
      const el = ((now - t0.current) / 1000) * speed;
      if (el >= maxFlight + 0.25) { setPlaying(false); setT(null); return; }
      setT(el); raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, speed, maxFlight]);
  const svg = useMemo(() => trajSvg({
    means: mode === "mean" ? shown : shown.map(x => ({ ...x })),
    each: mode === "each" ? each.filter(e => !hidden.has(e.t)) : [], view, tNow: t,
    label: `${VIEWS.find(v => v[0] === view)[1]}에서 본 구종별 공의 궤적`,
  }), [shown, each, view, mode, t, hidden]);
  const toggle = nm => setHidden(s => { const n = new Set(s); n.has(nm) ? n.delete(nm) : n.add(nm); return n; });
  return (
    <>
      <h3>공의 움직임</h3>
      <div className="seg-row">
        {VIEWS.map(([k, nm]) => <button key={k} className={"chip" + (view === k ? " on" : "")} onClick={() => setView(k)}>{nm}</button>)}
        <span className="sep" />
        {[["mean", "구종 평균"], ["each", "개별 투구 포함"]].map(([k, nm]) => <button key={k} className={"chip" + (mode === k ? " on" : "")} onClick={() => setMode(k)}>{nm}</button>)}
      </div>
      <div className="seg-row">
        <button className="btn small" onClick={() => { if (playing) { setPlaying(false); } else { setT(0); setPlaying(true); } }}>{playing ? "멈춤" : "공 던지기"}</button>
        {[[1, "실제 속도"], [0.25, "1/4 속도"]].map(([k, nm]) => <button key={k} className={"chip" + (speed === k ? " on" : "")} onClick={() => setSpeed(k)}>{nm}</button>)}
      </div>
      <div style={{ maxWidth: 560, margin: "6px 0" }} dangerouslySetInnerHTML={{ __html: svg }} />
      <ul className="legend2">{means.map(x => (
        <li key={x.t}><button className={"chip" + (hidden.has(x.t) || x.n < MIN_N ? "" : " on")} style={{ borderColor: tcol(x.t) }} onClick={() => toggle(x.t)} aria-pressed={!hidden.has(x.t)}><i style={{ background: tcol(x.t), display: "inline-block", marginRight: 6 }} />{x.t} {x.n}구</button></li>
      ))}</ul>
      <p className="legend">{t != null && playing ? `릴리스 후 ${t.toFixed(3)}초` : "점선은 측정이 시작되기 전의 추정 구간이고, 마지막 점이 홈플레이트에 닿는 위치입니다."} 네모는 스트라이크존(리그 평균 높이 기준)이에요. 구종 이름을 누르면 그림에서 빼고 넣을 수 있습니다.</p>
    </>
  );
}

function Tunnel({ means }) {
  const base = means.filter(x => x.n >= 30);
  const [bt, setBt] = useState(base[0] ? base[0].t : null);
  const b = base.find(x => x.t === bt) || base[0];
  if (!b || base.length < 2) return null;
  const rows = base.filter(x => x.t !== b.t).map(x => ({ t: x.t, n: x.n, s: tunnelStats(b.m, x.m) })).filter(r => r.s);
  if (!rows.length) return null;
  return (
    <>
      <h3>구종 비교: 어디까지 같은 길로 오다가 갈라지나</h3>
      <div className="seg-row">
        <span className="hint" style={{ alignSelf: "center" }}>기준 구종</span>
        {base.map(x => <button key={x.t} className={"chip" + (x.t === b.t ? " on" : "")} onClick={() => setBt(x.t)}>{x.t}</button>)}
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>{b.t}과 비교</th><th>투구</th><th>릴리스 차이</th><th>판단 시점 차이</th><th>홈 도착 차이</th><th>갈라짐 배율</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.t}><td><i style={{ background: tcol(r.t), display: "inline-block", width: 10, height: 10, borderRadius: 5, marginRight: 6 }} />{r.t}</td><td>{r.n}</td><td>{r.s.release.toFixed(1)}cm</td><td>{r.s.decision.toFixed(1)}cm</td><td>{r.s.plate.toFixed(1)}cm</td><td><b>{r.s.ratio.toFixed(1)}배</b></td></tr>)}</tbody>
      </table></div>
      <div style={{ maxWidth: 560, margin: "10px 0" }} dangerouslySetInnerHTML={{ __html: tunnelSvg(rows, { label: `${b.t}과 다른 구종 사이 거리 변화` }) }} />
      <p className="legend">두 구종의 평균 궤적을 홈 도착 전 같은 시간에 맞춰 비교했어요. 타자 판단 시점은 홈 도착 0.167초 전(홈에서 약 7m)이고, 이때 거리가 가까울수록 타자가 구종을 구분하기 어렵습니다. 갈라짐 배율은 홈 도착 차이를 판단 시점 차이로 나눈 값이라 클수록 늦게 갈라져 속이기 좋다는 뜻이에요. 투구 {MIN_N * 3}구 미만 구종은 뺐습니다.</p>
    </>
  );
}

function Predict({ f, meta }) {
  const types = meta.types, k = f.ty.length;
  const [c, setC] = useState(0), [st, setSt] = useState(0), [prev, setPrev] = useState(-1), [zt, setZt] = useState(0);
  const probs = typeProbs(f, c, st, prev), sorted = [...probs].sort((a, b) => b.p - a.p);
  const j = Math.min(zt, k - 1), zp = zoneProbs(f, j, st, c);
  const zmax = zp.indexOf(Math.max(...zp)), ev = evidence(f, c, st);
  const m = meta;
  return (
    <>
      <h3>다음 공 예측</h3>
      <p className="legend" style={{ marginTop: 0 }}>상황을 고르면 이 투수가 다음에 던질 공의 구종·코스·헛스윙 확률이 나옵니다. 모델이 맞히는 정확도는 아래 "어떻게 만들었나"에 정리했어요.</p>
      <div className="seg-row">
        <span className="hint" style={{ alignSelf: "center" }}>볼-스트라이크</span>
        {COUNTS.map(x => <button key={x.c} className={"chip" + (x.c === c ? " on" : "")} onClick={() => setC(x.c)}>{x.name}</button>)}
      </div>
      <div className="seg-row">
        <span className="hint" style={{ alignSelf: "center" }}>타자</span>
        {[[0, "우타자"], [1, "좌타자"]].map(([v, nm]) => <button key={v} className={"chip" + (st === v ? " on" : "")} onClick={() => setSt(v)}>{nm}</button>)}
        <span className="sep" />
        <span className="hint" style={{ alignSelf: "center" }}>직전 공</span>
        <button className={"chip" + (prev < 0 ? " on" : "")} onClick={() => setPrev(-1)}>없음(타석 첫 공)</button>
        {f.ty.map((t, i) => <button key={t} className={"chip" + (prev === i ? " on" : "")} onClick={() => setPrev(i)}>{types[t]}</button>)}
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>다음 공 구종</th><th>예상 확률</th><th></th><th>예상 헛스윙(스윙 중)</th></tr></thead>
        <tbody>{sorted.map(x => { const jj = f.ty.indexOf(x.t); return (
          <tr key={x.t} className={jj === j ? "mine" : ""} onClick={() => setZt(jj)} style={{ cursor: "pointer" }}>
            <td><i style={{ background: tcol(types[x.t]), display: "inline-block", width: 10, height: 10, borderRadius: 5, marginRight: 6 }} />{types[x.t]}</td>
            <td><b>{f1(x.p * 100)}%</b></td>
            <td style={{ width: "40%", minWidth: 90 }}><span style={{ display: "block", height: 8, borderRadius: 4, background: tcol(types[x.t]), width: `${Math.max(2, x.p * 100)}%` }} /></td>
            <td>{f1(whiffProb(f, jj, st, c) * 100)}%</td>
          </tr>); })}</tbody>
      </table></div>
      <p className="legend">같은 카운트·같은 쪽 타석에서 이 투수가 던진 공은 시즌 {ev}개예요{ev < 30 ? "(적어서 리그 경향 쪽으로 많이 당겨 계산했습니다)" : ""}. 줄을 누르면 아래 코스 그림이 그 구종으로 바뀝니다.</p>
      <div className="spray-grid">
        <figure>
          <div dangerouslySetInnerHTML={{ __html: zoneProbSvg(zp, { color: tcol(types[f.ty[j]]), label: `${types[f.ty[j]]} 예상 코스` }) }} />
          <figcaption>{types[f.ty[j]]} 예상 코스(%)</figcaption>
        </figure>
        <div>
          <p style={{ marginTop: 8 }}>가장 많이 갈 곳: <b>{meta.zone[zmax]}</b> ({f1(zp[zmax] * 100)}%)</p>
          <p className="legend">포수 시점이고, 가운데 3x3이 스트라이크존, 모서리 네모 4개는 존 밖입니다. 카운트 구간은 "{CG_LABEL[cgOf(c)]}"로 묶어 계산했어요.</p>
        </div>
      </div>
      <details className="explain">
        <summary>이 예측은 어떻게 만들었나</summary>
        <p>2026 시즌 투구를 날짜순으로 나눠(학습 {m.split.train}, 검증 {m.split.val}, 시험 {m.split.test}) 모델 여러 개를 비교했고, 검증에서 가장 좋은 모델을 골라 전체 기록으로 다시 학습해 표로 미리 계산했습니다. 점수가 작을수록 좋아요(로그손실).</p>
        <ModelTable title="다음 공 구종" info={m.type} cols={[["val", "검증"], ["test", "시험"], ["acc", "맞힌 비율"]]} fmt={{ acc: v => f1(v * 100) + "%" }} />
        <ModelTable title="공이 갈 코스(13칸)" info={m.zone_model} cols={[["val", "검증"], ["test", "시험"]]} />
        <ModelTable title="스윙했을 때 헛스윙 확률" info={m.whiff} cols={[["val", "검증"], ["test", "시험"], ["auc", "구분력(AUC)"]]} />
        {m.type.note_situ && <p className="legend">{m.type.note_situ}</p>}
        <p className="legend">구종 맞히기는 어느 모델이든 절반을 넘기기 어려워요. 같은 상황에서도 투수가 매번 다른 공을 던지기 때문이고, 그래서 확률로 보여 줍니다. 타자별 차이, 포수의 사인, 상대 팀 전략은 반영하지 못했습니다.</p>
      </details>
    </>
  );
}

function ModelTable({ title, info, cols, fmt = {} }) {
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>{title}</th>{cols.map(c => <th key={c[0]}>{c[1]}</th>)}</tr></thead>
      <tbody>{Object.entries(info.models).map(([k, v]) => <tr key={k} className={k === info.best ? "mine" : ""}><td>{k}{k === info.best ? " (선택)" : ""}</td>{cols.map(c => <td key={c[0]}>{v[c[0]] == null ? "-" : fmt[c[0]] ? fmt[c[0]](v[c[0]]) : v[c[0]]}</td>)}</tr>)}</tbody>
    </table></div>
  );
}
