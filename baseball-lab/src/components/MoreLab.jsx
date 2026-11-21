import { useEffect, useState } from "react";
import { Api } from "../lib/api.js";
import { slash, f1, f3 } from "../lib/spray.js";
import { CAT_NAMES, PREV_NAMES, NEXT_NAMES, MU_B, MU_P, pc, per100, fx, sx, tone, muStats, bipStats, isStarter } from "../lib/more.js";

const ops = a => { const s = slash(a); return s ? s.ops : null; };

/** 선수 한 명의 추가 분석: 공 가치, 매치업 예상, 공 연결·접근각·터널링, 부하·휴식·타자 상대 횟수, 타구 유형 (2026 시즌만) */
export default function MoreLab({ rec }) {
  const [m, setM] = useState(null);
  useEffect(() => { let on = true; Api.more().then(d => on && setM(d)); return () => { on = false; }; }, []);
  if (!m || rec.season !== 2026) return null;
  const isBat = rec.type === "batter", id = String(rec.params.target), e = (isBat ? m.b : m.p)[id];
  if (!e) return null;
  return (
    <section className="sec rep spray" id="r-more">
      <h2>{isBat ? "공 가치·매치업·타구 유형 (2026 시즌)" : "공 가치·공 연결·부하·매치업 (2026 시즌)"}</h2>
      <p className="sub">공 하나하나가 기대 득점을 얼마나 바꿨는지, 어떤 상대를 만나면 어떻게 될지, 공을 어떤 순서로 던지는지를 투구 단위 기록으로 계산했어요. 한 시즌 표본이라 작은 차이는 우연일 수 있습니다.</p>
      {isBat ? <BatterRv e={e} m={m} /> : <PitcherRv e={e} m={m} />}
      {e.mu && <Matchup e={e} m={m} isBat={isBat} />}
      {!isBat && <PitcherExtra e={e} m={m} />}
      {e.bip && <Bip e={e} m={m} isBat={isBat} />}
      <Method m={m} isBat={isBat} />
    </section>
  );
}

function BatterRv({ e, m }) {
  if (!e.rv) return null;
  const [n, tot] = e.rv[4];
  return (
    <>
      <h3>공 가치: 같은 볼카운트의 평균보다 얼마나 이득을 봤나</h3>
      <div className="table-wrap"><table>
        <thead><tr><th>공이 온 곳과 내 선택</th><th>공</th><th>100구당 득점(평균 대비)</th></tr></thead>
        <tbody>{CAT_NAMES.map((nm, i) => { const [c, s] = e.rv[i], v = per100(s, c); return c ? <tr key={i}><td>{nm}</td><td>{c}</td><td className={c >= 100 ? tone(v) : ""}>{sx(v, 2)}</td></tr> : null; })}</tbody>
      </table></div>
      <p className="legend">공 하나가 그 타석의 기대 득점(볼카운트·아웃·주자 기준)을 얼마나 바꿨는지를 더한 값이에요. 같은 볼카운트에서 같은 선택(존 안·밖, 스윙·지켜봄)을 한 리그 평균과 비교해, 양수일수록 평균보다 이득을 봤다는 뜻입니다. 시즌 공 {n}개의 총합은 {sx(tot, 1)}점이고, 100공 미만인 줄은 색을 넣지 않았습니다.</p>
    </>
  );
}

function PitcherRv({ e, m }) {
  if (!e.rv) return null;
  const lg = m.meta.rv.lg_p, rows = Object.entries(e.rv).sort((a, b) => b[1][0] - a[1][0]);
  return (
    <>
      <h3>구종별 공 가치</h3>
      <div className="table-wrap"><table>
        <thead><tr><th>구종</th><th>투구</th><th>100구당 득점 억제</th><th>리그 평균(같은 구종)</th><th>차이</th></tr></thead>
        <tbody>{rows.map(([t, [n, s]]) => { const v = per100(s, n), L = lg[t] && per100(lg[t][1], lg[t][0]); return <tr key={t}><td>{t}</td><td>{n}</td><td><b>{sx(v, 2)}</b></td><td>{L == null ? "-" : sx(L, 2)}</td><td className={n >= 150 && L != null ? tone(v - L) : ""}>{L == null ? "-" : sx(v - L, 2)}</td></tr>; })}</tbody>
      </table></div>
      <p className="legend">공 하나가 그 타석의 기대 득점을 얼마나 줄였는지를 100구당으로 나타낸 값이고, 플러스일수록 투수에게 이득입니다. 150구 미만 줄은 색을 넣지 않았어요.</p>
    </>
  );
}

function Matchup({ e, m, isBat }) {
  const names = isBat ? MU_B : MU_P, lg = muStats(m.meta.mu.lg);
  const rows = names.filter(n => e.mu[n]);
  if (!rows.length) return null;
  return (
    <>
      <h3>{isBat ? "이런 투수를 만나면 (예상 타석 결과)" : "이런 타자를 만나면 (예상 타석 결과)"}</h3>
      <div className="table-wrap"><table>
        <thead><tr><th>{isBat ? "상대 투수" : "상대 타자"}</th><th>삼진</th><th>볼넷·사구</th><th>안타</th><th>홈런</th><th>출루</th></tr></thead>
        <tbody>{rows.map(n => { const s = muStats(e.mu[n]); return <tr key={n}><td>{n}</td><td>{f1(s.so)}%</td><td>{f1(s.bb)}%</td><td>{f1(s.hit)}%</td><td>{f1(s.hr)}%</td><td><b>{f1(s.obp)}%</b></td></tr>; })}
          <tr className="lg"><td>리그 평균 타석</td><td>{f1(lg.so)}%</td><td>{f1(lg.bb)}%</td><td>{f1(lg.hit)}%</td><td>{f1(lg.hr)}%</td><td>{f1(lg.obp)}%</td></tr></tbody>
      </table></div>
      <p className="legend">두 선수의 시즌 기록과 좌우 조합으로 만든 예상 값(타석 100% 중 비율)입니다. 모델은 {m.meta.mu.best}를 썼고, 리그 평균보다 정확도가 아주 조금 나아지는 수준이라 큰 차이를 말하는 값은 아니에요.</p>
    </>
  );
}

function PitcherExtra({ e, m }) {
  const sq = m.meta.seq, ex = [];
  if (e.seq) {
    const t = e.seq.t, g = sq.lg, cell = (arr, a, b) => { const o = (a * 3 + b) * 4; return arr.slice(o, o + 4); };
    ex.push(
      <div key="seq">
        <h3>공 연결: 직전 공에 따라 다음 공의 효과가 달라지나</h3>
        <div className="table-wrap"><table>
          <thead><tr><th>직전 공</th>{NEXT_NAMES.map(n => <th key={n}>다음 {n} CSW%</th>)}</tr></thead>
          <tbody>{PREV_NAMES.map((nm, a) => <tr key={a}><td>{nm}</td>{NEXT_NAMES.map((_, b) => { const c = cell(t, a, b), L = cell(g, a, b), v = pc(c[3], c[0]), lv = pc(L[3], L[0]); return <td key={b} className={c[0] >= 60 && lv != null ? tone(v - lv) : ""}>{c[0] ? f1(v) + "%" : "-"}<small> ({c[0]}구, 리그 {f1(lv)}%)</small></td>; })}</tr>)}</tbody>
        </table></div>
        {e.seq.d[1] >= 20 && <p className="legend">직구계 다음에 오프스피드를 던질 때 평균 구속 차이는 {fx(e.seq.d[0] / e.seq.d[1], 1)} km/h입니다. CSW는 지켜본 스트라이크와 헛스윙을 합친 비율이고, 60구 미만 칸은 색을 넣지 않았어요. {sq.best.startsWith("공 하나만") ? "시험해 보니 직전 공 정보를 더해도 스트라이크 예측이 좋아지지 않아(아래 모델 비교), 이 표의 차이는 투수의 습관을 보여 줄 뿐 효과가 입증된 것은 아닙니다." : "직전 공 정보를 더하면 스트라이크 예측이 좋아졌습니다(아래 모델 비교)."}</p>}
      </div>
    );
  }
  if (e.vaa) {
    const lv = sq.lg_vaa, rows = Object.entries(e.vaa).sort((a, b) => b[1][1] - a[1][1]);
    ex.push(
      <div key="vaa">
        <h3>수직 접근각(VAA)</h3>
        <div className="table-wrap"><table>
          <thead><tr><th>구종</th><th>투구</th><th>접근각</th><th>리그 같은 구종</th></tr></thead>
          <tbody>{rows.map(([t, [v, n]]) => <tr key={t}><td>{t}</td><td>{n}</td><td>{fx(v, 2)}°</td><td>{lv[t] ? fx(lv[t][0], 2) + "°" : "-"}</td></tr>)}</tbody>
        </table></div>
        <p className="legend">접근각은 공이 홈플레이트로 내려오는 각도라, 같은 위치라도 0에 가까울수록(덜 가파를수록) 위쪽 공이 더 위로 뜨는 것처럼 보입니다. 구종끼리 얼마나 늦게 갈라지는지는 아래 "구종 비교"에서 볼 수 있어요. 측정값 기반 근사입니다.</p>
      </div>
    );
  }
  if (e.work) {
    const lgw = m.meta.work.lg[isStarter(e.work) ? "sp" : "rel"], names = m.meta.work.rest;
    ex.push(
      <div key="work">
        <h3>휴식일에 따른 성적과 구속</h3>
        <div className="table-wrap"><table>
          <thead><tr><th>휴식</th><th>등판</th><th>9이닝 자책점</th><th>직구 구속(평소 대비)</th><th>리그 구속 변화</th></tr></thead>
          <tbody>{e.work.map((r, i) => r[0] ? <tr key={i}><td>{names[i]}</td><td>{r[0]}</td><td>{r[1] >= 9 ? fx((r[2] * 27) / r[1], 2) : "-"}</td><td>{r[4] ? sx(r[3] / r[4], 2) + " km/h" : "-"}</td><td>{lgw[i][4] ? sx(lgw[i][3] / lgw[i][4], 2) : "-"}</td></tr> : null)}</tbody>
        </table></div>
        <p className="legend">그 투수의 시즌 평균 직구 구속과의 차이입니다. 리그 전체로 보면 휴식일과 최근 투구 수는 구속을 거의 설명하지 못했어요(아래 모델 비교). 선발·구원 구분은 평균 투구 이닝으로 했습니다.</p>
      </div>
    );
  }
  if (e.tto) {
    const lt = m.meta.work.tto_lg, names = ["첫 대결", "두 번째 대결", "세 번째 이상"];
    ex.push(
      <div key="tto">
        <h3>같은 타자를 몇 번째 만나는가</h3>
        <div className="table-wrap"><table>
          <thead><tr><th>구분</th><th>타석</th><th>OPS 허용</th><th>리그 OPS</th><th>삼진%</th></tr></thead>
          <tbody>{e.tto.map((a, i) => { const s = slash(a), l = slash(lt[i]); return s ? <tr key={i}><td>{names[i]}</td><td>{s.pa}</td><td className={s.pa >= 80 ? tone(l.ops - s.ops) : ""}>{f3(s.ops)}</td><td>{f3(l.ops)}</td><td>{f1(s.so)}%</td></tr> : null; })}</tbody>
        </table></div>
        {e.li && <p className="legend">그날 처음 상대한 타석의 평균 승부처 정도는 {fx(e.li[0], 2)}(1.00이 평균)입니다. 같은 타자를 거듭 만날수록 성적이 나빠진다는 말은 리그 전체로 봐도 차이가 작았어요.</p>}
      </div>
    );
  }
  return <>{ex}</>;
}

function Bip({ e, m, isBat }) {
  const lg = m.meta.bip.lg, a = bipStats(e.bip), l = bipStats(lg);
  return (
    <>
      <h3>타구 유형·병살{isBat ? "" : "·실책"}</h3>
      <div className="table-wrap"><table>
        <thead><tr><th>구분</th><th>{isBat ? "이 선수" : "이 투수"}</th><th>리그</th></tr></thead>
        <tbody>
          <tr><td>땅볼 아웃 : 뜬공 아웃</td><td>{fx(a.gbfb, 2)}</td><td>{fx(l.gbfb, 2)}</td></tr>
          <tr><td>라인드라이브 아웃 비율(아웃 타구 중)</td><td>{f1(a.ld)}%</td><td>{f1(l.ld)}%</td></tr>
          <tr><td>병살 기회 대비 병살타 ({e.bip[1]}번 중 {e.bip[2]}번)</td><td className={e.bip[1] >= 40 ? tone(a.gdp - l.gdp, isBat ? -1 : 1) : ""}>{f1(a.gdp)}%</td><td>{f1(l.gdp)}%</td></tr>
          <tr><td>실책으로 출루 / 야수선택</td><td>{a.roe} / {a.fc}</td><td>-</td></tr>
        </tbody>
      </table></div>
      <p className="legend">타구 유형은 기록에 적힌 아웃 타구 기준입니다(안타는 유형이 없음). 병살 기회는 1루에 주자가 있고 2아웃 미만인 타석이에요.</p>
    </>
  );
}

function Method({ m, isBat }) {
  const { rv, mu, seq, work } = m.meta;
  const T = ({ rows, cols, best }) => (
    <div className="table-wrap"><table><thead><tr><th>모델</th>{cols.map(c => <th key={c[0]}>{c[1]}</th>)}</tr></thead>
      <tbody>{Object.entries(rows).map(([k, v]) => <tr key={k} className={k === best ? "mine" : ""}><td>{k}</td>{cols.map(c => <td key={c[0]}>{v[c[0]]}</td>)}</tr>)}</tbody></table></div>
  );
  return (
    <details className="explain">
      <summary>이 분석은 어떻게 만들었나</summary>
      <p><b>공 가치</b>: 타석이 끝났을 때의 득점 변화(RE24)를 정답으로 두고, 볼카운트·아웃·주자 상황에서 앞으로의 기대 득점을 예측해 공 하나 전후의 차이를 구했습니다. 마지막 공은 실제 결과의 득점 변화를 씁니다. 기대 득점 모델은 시간 순으로 비교해 <b>{rv.best}</b>를 골랐어요(평균제곱오차, 작을수록 좋음).</p>
      <T rows={rv.models} cols={[["val", "검증"], ["test", "시험"]]} best={rv.best} />
      <p><b>매치업</b>: 타석 결과를 6가지(삼진, 볼넷·사구, 단타, 2·3루타, 홈런, 그 외 아웃)로 나눠, 두 선수의 보정 기록과 좌우 조합으로 확률을 예측합니다(로그손실, 작을수록 좋음). 선택된 모델: <b>{mu.best}</b>.</p>
      <T rows={mu.models} cols={[["val", "검증"], ["test", "시험"]]} best={mu.best} />
      {!isBat && (
        <>
          <p><b>공 연결</b>: 직전 공 정보(구종·구속 차·위치·헛스윙 여부)를 넣으면 스트라이크를 만들 확률 예측이 좋아지는지 비교했습니다.</p>
          <T rows={seq.models} cols={[["val", "검증"], ["test", "시험"]]} best={seq.best} />
          <p><b>부하·휴식</b>: 휴식일, 최근 3·7일 투구 수, 선발 여부로 평소 구속과의 차이를 예측해 봤습니다(평균제곱오차). 가장 좋은 쪽은 <b>{work.best}</b>였어요. 즉 이 변수들이 구속을 설명하지 못했다는 뜻입니다.</p>
          <T rows={work.models} cols={[["val", "검증"], ["test", "시험"]]} best={work.best} />
        </>
      )}
    </details>
  );
}
