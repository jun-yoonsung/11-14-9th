import { useEffect, useState } from "react";
import { Api } from "../lib/api.js";
import { plot } from "../lib/chart.js";

const PCT = ["K", "BBr", "HRr"];   // 비율 지표는 %로 보여 준다
const fx = (k, v, d) => (PCT.includes(k) ? `${(v * 100).toFixed(1)}%` : v.toFixed(d));

/** OPS·ERA 외 다른 지표의 앞으로 5년 예측 (ml/train_forecast_extra.py → forecast_extra.json) */
function ExtraStats({ pid, type, base }) {
  const [ex, setEx] = useState(null), [sel, setSel] = useState(null);
  useEffect(() => { let live = true; Api.forecastExtra().then(x => { if (live) setEx(x); }); return () => { live = false; }; }, []);
  const p = ex?.players?.[pid], list = ex?.meta?.stats?.[type];
  if (!p || !list) return null;
  const cur = list.find(s => s.key === (sel || list[0].key)), e = p[cur.key], m = ex.meta.metrics[`${type}:${cur.key}`];
  if (!e) return null;
  const g = plot({ series: [{ name: cur.label, color: "#5e6ad2", width: 2.2, pts: [{ x: base, y: e.now }, ...e.pred.map(q => ({ x: base + q.h, y: q.mid, t: `${base + q.h} 예측 ${fx(cur.key, q.mid, cur.digits)}` }))] }], bands: [{ color: "#e3e6f8", pts: [{ x: base, lo: e.now, hi: e.now }, ...e.pred.map(q => ({ x: base + q.h, lo: q.lo, hi: q.hi }))] }], yDigits: PCT.includes(cur.key) ? 3 : cur.digits, H: 200 });
  return (
    <div style={{ marginTop: 18 }}>
      <h3>다른 지표도 예측해 보기</h3>
      <div className="chips" role="group" aria-label="예측할 지표">{list.map(s => <button key={s.key} className="chip" type="button" aria-pressed={s.key === cur.key} onClick={() => setSel(s.key)}>{s.label}</button>)}</div>
      <figure className="fc-chart"><svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={`${cur.label} 예측 그래프`}>
        {g.yt.map(t => <g key={t.y}><line x1={g.L} x2={g.W - g.R} y1={t.y} y2={t.y} className="fc-grid" /><text x={g.L - 6} y={t.y + 4} textAnchor="end" className="fc-tick">{t.label}</text></g>)}
        {g.bandPaths.map((b, i) => <path key={i} d={b.d} className="fc-band" />)}
        {g.paths.map(q => <path key={q.name} d={q.d} className="fc-line" />)}
        {g.dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} className={i ? "fc-dot" : "fc-dot now"}><title>{d.title}</title></circle>)}
        {g.xt.map(t => <text key={t.label} x={t.x} y={g.H - 10} textAnchor="middle" className="fc-tick">{t.label}</text>)}
      </svg><figcaption>올해 {fx(cur.key, e.now, cur.digits)}에서 이어지는 예측입니다. 옅은 띠는 80% 범위예요.</figcaption></figure>
      <div className="table-wrap"><table className="tf-t"><thead><tr><th>시즌</th><th>예상 {cur.label}</th><th>80% 범위</th></tr></thead><tbody>
        {e.pred.map(q => <tr key={q.h}><td>{base + q.h}</td><td>{fx(cur.key, q.mid, cur.digits)}</td><td>{fx(cur.key, q.lo, cur.digits)} ~ {fx(cur.key, q.hi, cur.digits)}</td></tr>)}</tbody></table></div>
      <p className="note">시험 구간(2024~{base})에서 1년 뒤 평균 오차는 {fx(cur.key, m[1].mae_chosen, cur.digits + (PCT.includes(cur.key) ? 0 : 0))}로, 작년 기록을 그대로 쓰는 방법({fx(cur.key, m[1].mae_last, cur.digits)})보다 {m[1].mae_chosen < m[1].mae_last ? "작았" : "크거나 같았"}고 80% 범위 적중률은 {Math.round(m[1].coverage80 * 100)}%였어요. OPS·ERA보다 단순하게 만든 예측이라 참고용으로 봐 주세요.</p>
    </div>
  );
}

const METHOD = { ml: "머신러닝 모델", marcel: "최근 3시즌 가중 평균", league: "리그 평균" };
const f3 = v => v.toFixed(3);

/** 앞으로 5년 예측(타자 OPS, 투수 ERA)과 현역 지속 확률. 미리 학습해 둔 결과(public/data/forecast.json)를 보여 준다. */
export default function Forecast({ rec }) {
  const [fc, setFc] = useState(null);
  useEffect(() => {
    let live = true;
    Api.forecast().then(all => { if (live) setFc(all); }).catch(() => {});
    return () => { live = false; };
  }, [rec]);
  const p = fc?.players?.[String(rec.params.target)];
  if (!p || rec.season !== fc.meta.base_season) return null;
  const isBat = p.type === "batter", name = isBat ? "OPS" : "평균자책점(ERA)", m = fc.meta.metrics[p.type];
  const base = { age: p.age, year: fc.meta.base_season, mid: p.now, lo: p.now, hi: p.now };
  const pts = [base, ...p.pred];
  // 간단한 선 그래프: 예측 범위(80%)를 띠로 그린다
  const W = 640, H = 220, L = 46, R = 14, T = 14, B = 30;
  const vals = pts.flatMap(x => [x.lo, x.hi]), lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.12 || 0.1;
  const y0 = lo - pad, y1 = hi + pad, X = i => L + (i / (pts.length - 1)) * (W - L - R), Y = v => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const band = `${pts.map((x, i) => `${i ? "L" : "M"}${X(i)},${Y(x.hi)}`).join(" ")} ${pts.slice().reverse().map((x, i) => `L${X(pts.length - 1 - i)},${Y(x.lo)}`).join(" ")}Z`;
  const line = pts.map((x, i) => `${i ? "L" : "M"}${X(i)},${Y(x.mid)}`).join(" ");
  const ticks = [0, 1, 2, 3].map(k => y0 + ((y1 - y0) * k) / 3);
  const e1 = m.reg[1], a1 = m.act[1];
  const retire = p.retire_by ? `현역 확률이 50% 아래로 내려가는 첫 나이는 ${p.retire_by}세로 예측됩니다.` : "향후 5년 안에는 현역 확률이 50% 아래로 내려가지 않는 것으로 예측됩니다.";
  const weak = p.pred.filter(x => x.method !== "ml");
  return (
    <section className="sec fc-box" aria-label="앞으로 5년 예측">
      <h2>앞으로 5년 예측 <small className="tag">실험적 기능</small></h2>
      <p className="sub">과거 KBO 선수들의 시즌 기록(1990~2026)으로 학습한 모델이 {p.name} 선수의 향후 {name}과 현역으로 남아 있을 확률을 예측했어요. 한 시즌의 우연한 변동은 평균 쪽으로 되돌아가는 경향이 있어서, 올해 기록이 아주 좋거나 나빴다면 예측은 그보다 평균에 가깝게 나옵니다.</p>
      <figure className="fc-chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${p.name} ${name} 예측 그래프`}>
          {ticks.map(t => <g key={t}><line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} className="fc-grid" /><text x={L - 6} y={Y(t) + 4} textAnchor="end" className="fc-tick">{isBat ? t.toFixed(2) : t.toFixed(1)}</text></g>)}
          <path d={band} className="fc-band" /><path d={line} className="fc-line" />
          {pts.map((x, i) => <g key={i}><circle cx={X(i)} cy={Y(x.mid)} r={i ? 4 : 5} className={i ? "fc-dot" : "fc-dot now"}><title>{`${x.year} ${f3(x.mid)}`}</title></circle><text x={X(i)} y={H - 10} textAnchor="middle" className="fc-tick">{i ? `${x.year}` : `${x.year}(올해)`}</text></g>)}
        </svg>
        <figcaption>선은 예측값, 옅은 띠는 실제 값이 들어올 가능성이 80%인 범위입니다. 먼 미래일수록 띠가 넓어요.</figcaption>
      </figure>
      <div className="table-wrap"><table>
        <thead><tr><th>시즌</th><th>나이</th><th>예상 {isBat ? "OPS" : "ERA"}</th><th>80% 범위</th><th>현역일 확률</th><th>예측 방법</th></tr></thead>
        <tbody>
          <tr className="me"><td>{base.year} (올해)</td><td>{p.age}세</td><td>{f3(p.now)}</td><td>-</td><td>-</td><td>실제 기록</td></tr>
          {p.pred.map(x => <tr key={x.h}><td>{x.year}</td><td>{x.age}세</td><td>{f3(x.mid)}</td><td>{f3(x.lo)} ~ {f3(x.hi)}</td><td>{Math.round(x.active * 100)}%</td><td>{METHOD[x.method]}</td></tr>)}
        </tbody>
      </table></div>
      <p className="note"><b>은퇴 시기</b>: {retire} 현역 확률은 그 해에 KBO 1군 기록이 남아 있을 확률이며, 부상·군 복무·해외 진출도 "기록 없음"으로 잡힙니다.</p>
      <ExtraStats pid={String(rec.params.target)} type={p.type} base={fc.meta.base_season} />
      <details className="fc-acc"><summary>이 예측은 얼마나 믿을 수 있나요?</summary>
        <ul className="plain">
          <li>2024~{fc.meta.base_season} 시즌은 학습에 쓰지 않고 따로 떼어 두었다가 맞혀 봤어요. 1년 뒤 {isBat ? "OPS" : "ERA"} 평균 오차는 약 {f3(e1.mae_chosen)}로, 작년 기록을 그대로 쓰는 방법({f3(e1.mae_last)})보다 작았습니다.</li>
          <li>"80% 범위"에 실제 값이 들어온 비율은 1년 뒤 기준 {Math.round(e1.coverage80 * 100)}%였습니다. 범위를 벗어나는 경우도 그만큼 있다는 뜻이에요.</li>
          <li>현역 여부는 1년 뒤 기준 {Math.round(a1.auc * 100)}점(100점 만점, 50점이 동전 던지기 수준)으로 구분했어요.</li>
          {weak.length > 0 && <li>{weak.map(x => `${x.year}`).join(", ")} 시즌 예측은 시험에서 머신러닝 모델이 {isBat ? "다른 방법" : "리그 평균"}보다 낫지 않아 <b>{METHOD[weak[0].method]}</b> 방식으로 대신했어요. 투수의 먼 미래 성적은 특히 맞히기 어렵습니다.</li>}
          <li>예측은 "그 선수가 그 해에 충분히 뛴다"는 가정(타자 100타석, 투수 30이닝 이상)에서 계산한 값입니다. 부상이나 보직 변경은 반영하지 못합니다.</li>
        </ul>
      </details>
      <p className="note">학습 데이터: Kaggle <i>KBO Player Stats 1982–2026</i> (netsong, KBO 공식 기록 기반, CC BY-NC-SA 4.0). 학습용·비영리 프로젝트에서만 사용합니다.</p>
    </section>
  );
}
