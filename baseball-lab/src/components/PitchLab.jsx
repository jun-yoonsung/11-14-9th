import { useEffect, useState } from "react";
import { Api } from "../lib/api.js";
import { slash, f1, f3 } from "../lib/spray.js";
import { zoneSvg, zoneStats, ARS, arsRow, rollSvg, rolling, sumGames, PG_NAMES, SIT_LABELS, SIT_SHOW, CG_NAMES, fmt, sgn } from "../lib/pitchlab.js";

const pct = (a, b) => (b ? (a / b) * 100 : null);
const cls = (d, good = 1) => (d == null || Math.abs(d) < 1e-9 ? "" : d * good > 0 ? "good" : "bad");

/** 선수 한 명의 투구 존·구종·볼카운트·상황·득점 기여·피로·폼 (2026 시즌 선수만) */
export default function PitchLab({ rec }) {
  const [d, setD] = useState(null);
  useEffect(() => { let on = true; Promise.all([Api.pitchlab(), Api.situ(), Api.form()]).then(([pl, si, fo]) => on && setD({ pl, si, fo })); return () => { on = false; }; }, []);
  const isBat = rec.type === "batter", id = String(rec.params.target);
  const [metric, setMetric] = useState("n"), [pg, setPg] = useState(-1);
  if (!d || !d.pl || !d.si) return null;
  const { pl, si, fo } = d, lg = si.meta.lg;
  const z = (isBat ? pl.b : pl.p)[id], s = (isBat ? si.b : si.p)[id];
  if (!s || rec.season !== pl.meta.season) return null;
  const side = isBat ? "bat" : "pit";
  const metrics = isBat ? [["n", "공이 온 곳"], ["swing", "스윙"], ["whiff", "헛스윙"], ["hit", "안타 비율"]] : [["n", "던진 곳"], ["swing", "타자가 스윙"], ["whiff", "헛스윙 유도"], ["called", "지켜본 공 중 스트라이크"], ["hit", "맞은 안타 비율"]];
  const zs = z ? zoneStats(z.z, pg) : null, lgz = zoneStats(pl.meta.zlg, pg);
  const all = slash(s.all), lall = slash(lg.all);
  const sign = isBat ? 1 : -1;
  const games = isBat ? (fo && fo.b[id]) : null, logs = !isBat ? (fo && fo.p[id]) : null;

  return (
    <section className="sec rep spray" id="r-pitchlab">
      <h2>{isBat ? "투구 존·볼카운트·상황별 성적 (2026 시즌)" : "투구 분석·볼카운트·상황별 허용 성적 (2026 시즌)"}</h2>
      <p className="sub">공 하나하나의 위치와 결과, 타석이 시작될 때의 점수·주자·아웃 상황으로 만든 분석입니다. 표본이 작은 칸은 흔들리기 쉬우니 숫자 옆의 타석 수를 함께 보세요.</p>

      <div className="kpis kpis-sm">
        <div><span>득점 기여 (RE24)</span><b className={cls(s.re)}>{sgn(s.re)}점</b><em>{s.rk ? `리그 ${s.nq}명 중 ${s.rk.re}위` : "100타석 미만"}</em></div>
        <div><span>승리 기여 (WPA)</span><b className={cls(s.wpa)}>{sgn(s.wpa, 2)}승</b><em>{s.rk ? `${s.rk.wpa}위` : "-"}</em></div>
        <div><span>상황 보정 승리 기여</span><b className={cls(s.wl)}>{sgn(s.wl, 2)}승</b><em>{s.rk ? `${s.rk.wl}위` : "-"}</em></div>
        <div><span>평균 승부처 정도</span><b>{fmt(s.li, 2)}</b><em>1.00이 평균</em></div>
      </div>
      <p className="legend">{isBat ? "RE24는 타석 결과 때문에 기대 득점이 얼마나 늘었는지를 모두 더한 값, WPA는 팀이 이길 확률이 얼마나 늘었는지를 모두 더한 값이에요." : "투수는 부호를 뒤집어, 플러스일수록 팀에 도움이 된 값입니다. 앞선 주자의 득점 책임은 따로 나누지 않아 구원투수 값은 참고용이에요."} 승부처가 많은 타석을 맡을수록 WPA가 크게 움직여서, 상황 보정 값은 그 영향을 걷어낸 것입니다.</p>

      {z && (
        <>
          <h3>{isBat ? "스트라이크 존 칸별 보기" : "투구 존"}</h3>
          <div className="seg-row">
            {metrics.map(([k, nm]) => <button key={k} className={"chip" + (metric === k ? " on" : "")} onClick={() => setMetric(k)}>{nm}</button>)}
            <span className="sep" />
            {[[-1, "전체"], ...PG_NAMES.map((n, i) => [i, n])].map(([k, nm]) => <button key={k} className={"chip" + (pg === k ? " on" : "")} onClick={() => setPg(k)}>{nm}</button>)}
          </div>
          <div className="spray-grid">
            <div className="spray-svg sm" dangerouslySetInnerHTML={{ __html: zoneSvg(z.z, metric, pg, { label: "투구 존 그림" }) }} />
            {zs && (
              <div className="table-wrap"><table>
                <thead><tr><th>구분</th><th>{isBat ? "이 선수" : "이 투수"}</th><th>리그</th></tr></thead>
                <tbody>
                  <tr><td>스트라이크 존 안 공 비율</td><td>{f1(zs.zonePct)}%</td><td>{f1(lgz.zonePct)}%</td></tr>
                  <tr><td>존 안 공에 스윙</td><td>{f1(zs.zswing)}%</td><td>{f1(lgz.zswing)}%</td></tr>
                  <tr><td>존 밖 공에 스윙{isBat ? " (유인구에 속는 비율)" : ""}</td><td>{f1(zs.chase)}%</td><td>{f1(lgz.chase)}%</td></tr>
                  <tr><td>존 안 스윙 중 맞힌 비율</td><td>{f1(zs.zcontact)}%</td><td>{f1(lgz.zcontact)}%</td></tr>
                  <tr><td>전체 스윙 중 헛스윙</td><td>{f1(zs.whiff)}%</td><td>{f1(lgz.whiff)}%</td></tr>
                </tbody>
              </table></div>
            )}
          </div>
          <p className="legend">진한 사각형이 스트라이크 존(가운데 3×3)이고 바깥 한 겹은 존 밖입니다. 포수가 보는 방향이라 오른쪽이 1루 쪽이에요. 칸에 공이 {isBat ? "15" : "15"}개 미만이면 비율은 비워 둡니다.</p>
        </>
      )}

      {!isBat && z && z.ars && Object.keys(z.ars).length > 0 && <Arsenal z={z} pl={pl} />}
      {!isBat && z && z.fat && <Fatigue z={z} pl={pl} logs={logs} />}

      <h3>볼카운트별 {isBat ? "성적" : "허용 성적"}</h3>
      <div className="table-wrap"><table>
        <thead><tr><th>볼카운트로 끝난 타석</th><th>타석</th><th>타율</th><th>출루율</th><th>장타율</th><th>OPS</th><th>삼진%</th><th>리그 OPS</th></tr></thead>
        <tbody>{CG_NAMES.map((nm, i) => { const a = slash(s.cr[i]), l = slash(lg.cr[i]); return a ? <tr key={i}><td>{nm}</td><td>{a.pa}</td><td>{f3(a.avg)}</td><td>{f3(a.obp)}</td><td>{f3(a.slg)}</td><td className={cls(a.ops - l.ops, sign)}><b>{f3(a.ops)}</b></td><td>{f1(a.so)}%</td><td>{f3(l.ops)}</td></tr> : null; })}</tbody>
      </table></div>
      <p className="legend">타석의 마지막 공을 던질 때의 볼카운트 기준입니다. 2스트라이크는 다른 줄과 겹쳐 셉니다.</p>
      {s.cg && (
        <div className="table-wrap"><table>
          <thead><tr><th>그 카운트에서 던진·본 공</th><th>공</th><th>스윙</th><th>헛스윙</th><th>직구계</th><th>변화구</th><th>오프스피드</th><th>리그 스윙</th></tr></thead>
          <tbody>{CG_NAMES.map((nm, i) => { const c = s.cg[i], u = s.cu[i], tot = u[0] + u[1] + u[2], L = lg.cg[i]; return c[0] ? <tr key={i}><td>{nm}</td><td>{c[0]}</td><td>{f1(pct(c[1], c[0]))}%</td><td>{f1(pct(c[2], c[1]))}%</td>{u.map((v, k) => <td key={k}>{f1(pct(v, tot))}%</td>)}<td>{f1(pct(L[1], L[0]))}%</td></tr> : null; })}</tbody>
        </table></div>
      )}

      <h3>상황별 {isBat ? "성적" : "허용 성적"}</h3>
      <div className="table-wrap"><table>
        <thead><tr><th>상황</th><th>타석</th><th>타율</th><th>출루율</th><th>장타율</th><th>OPS</th><th>삼진%</th><th>리그 OPS</th></tr></thead>
        <tbody>{SIT_SHOW.map(k => { const a = slash(s.sit[k]), l = slash(lg.sit[k]); return a && l ? <tr key={k} className={a.pa < 30 ? "lowrow" : ""}><td>{SIT_LABELS[side][k]}</td><td>{a.pa}</td><td>{f3(a.avg)}</td><td>{f3(a.obp)}</td><td>{f3(a.slg)}</td><td className={a.pa < 30 ? "" : cls(a.ops - l.ops, sign)}><b>{f3(a.ops)}</b></td><td>{f1(a.so)}%</td><td>{f3(l.ops)}</td></tr> : null; })}</tbody>
      </table></div>
      <p className="legend">타석이 30 미만인 줄은 흐리게 표시했고 색을 넣지 않았어요. 득점권에서의 강약은 한 시즌 기록으로는 대부분 우연의 영향이 커서 "클러치 능력"으로 읽으면 안 됩니다.</p>

      {isBat && games && games.length >= 10 && <Form id={id} games={games} fo={fo} all={all} />}
      <Method si={si} pl={pl} fo={fo} isBat={isBat} />
    </section>
  );
}

function Arsenal({ z, pl }) {
  const total = Object.values(z.ars).reduce((a, r) => a + r[0], 0), lgA = pl.meta.ars_lg, sm = pl.meta.stuff_mean;
  const rows = Object.entries(z.ars).sort((a, b) => b[1][0] - a[1][0]);
  return (
    <>
      <h3>구종별 구속·무브먼트·릴리스 포인트</h3>
      <div className="table-wrap"><table>
        <thead><tr><th>구종</th><th>투구</th><th>사용률</th><th>평균 구속</th><th>최고</th><th>팔 쪽 변화</th><th>위로 뜸</th><th>놓는 높이</th><th>흩어짐</th><th>헛스윙%</th><th>CSW%</th><th>구위</th></tr></thead>
        <tbody>{rows.map(([t, a]) => { const r = arsRow(a, total, sm), L = lgA[t] && arsRow(lgA[t], 1, sm); return (
          <tr key={t}><td>{t}</td><td>{r.n}</td><td>{f1(r.use)}%</td><td>{fmt(r.spd)} km/h{L && <small> ({fmt(L.spd)})</small>}</td><td>{fmt(r.max)}</td><td>{fmt(r.hm, 0)}"</td><td>{fmt(r.vm, 0)}"</td><td>{fmt(r.rz, 0)} cm</td><td>{fmt(r.rsd, 1)} cm</td><td className={L ? cls(r.whiff - L.whiff) : ""}>{f1(r.whiff)}%</td><td>{f1(r.csw)}%</td><td>{r.stuff ? r.stuff.toFixed(0) : "-"}</td></tr>); })}</tbody>
      </table></div>
      <p className="legend">괄호는 같은 구종의 리그 평균 구속입니다. 변화량은 공의 속도·가속도에서 계산한 근사치(인치, 중력 보정)이며, 팔 쪽 변화는 던지는 팔 쪽으로 휠수록 큽니다. 흩어짐은 같은 구종을 놓는 위치가 얼마나 일정한지(작을수록 일정)이고, CSW는 지켜본 스트라이크와 헛스윙을 합친 비율입니다. 구위는 공의 물리 값만으로 예상한 스트라이크 만드는 힘을 100(리그 평균)으로 나타낸 값인데, 모델이 평균보다 크게 나아지지 않아 참고용입니다.</p>
    </>
  );
}

function Fatigue({ z, pl, logs }) {
  const names = ["1~25구", "26~50구", "51~75구", "76~100구", "101구 이상"], lgF = pl.meta.fat_lg;
  const first = z.fat[0] && z.fat[0][1];
  const starts = (logs || []).filter(g => g[10] != null);
  return (
    <>
      <h3>투구 수에 따른 직구 구속 (피로)</h3>
      <div className="table-wrap"><table>
        <thead><tr><th>그 경기에서 던진 공 수</th><th>직구</th><th>평균 구속</th><th>처음 구간 대비</th><th>리그 평균 구속</th></tr></thead>
        <tbody>{z.fat.map((f, i) => f[0] >= 5 ? <tr key={i}><td>{names[i]}</td><td>{f[0]}</td><td>{fmt(f[1])} km/h</td><td className={cls(f[1] - first)}>{sgn(f[1] - first)}</td><td>{fmt(lgF[i][1])}</td></tr> : null)}</tbody>
      </table></div>
      {starts.length >= 4 && <div className="spray-svg" style={{ maxWidth: 560 }} dangerouslySetInnerHTML={{ __html: rollSvg(starts.map(g => g[0]), starts.map(g => g[10]), starts.reduce((a, g) => a + g[10], 0) / starts.length, { fmt: v => v.toFixed(1), label: "경기별 직구 평균 구속" }) }} />}
      {starts.length >= 4 && <p className="legend">경기별 직구 평균 구속(점선은 시즌 평균)입니다. 공 수가 늘수록 구속이 얼마나 떨어지는지는 투수마다 다르지만, 많이 던진 날은 원래 구속이 빠른 투수가 선발로 나온 영향이 섞여 있어요.</p>}
    </>
  );
}

function Form({ id, games, fo, all }) {
  const ys = rolling(games, 15), xs = games.map(g => g[0]), recent = slash(sumGames(games.slice(-15))), est = fo.est[id], pk = fo.meta.picks;
  return (
    <>
      <h3>최근 폼</h3>
      <div className="spray-svg" style={{ maxWidth: 560 }} dangerouslySetInnerHTML={{ __html: rollSvg(xs, ys, all.ops, { label: "15경기 이동 OPS 추이" }) }} />
      <p className="legend">가로축은 시즌 전체 날짜예요. 파란 선의 점 하나는 "그 경기까지 최근 15경기"를 합쳐 계산한 OPS이고, 한 경기씩 밀어 가며 이어 그렸습니다(8경기째부터 표시). 점선은 시즌 전체 OPS({f3(all.ops)})입니다. 아래 표의 "최근 15경기"는 시즌 마지막 15경기만의 기록이에요.</p>
      <div className="table-wrap"><table>
        <thead><tr><th></th><th>타석</th><th>OPS</th><th>출루율</th><th>장타율</th></tr></thead>
        <tbody>
          <tr><td>시즌 전체</td><td>{all.pa}</td><td>{f3(all.ops)}</td><td>{f3(all.obp)}</td><td>{f3(all.slg)}</td></tr>
          {recent && <tr><td>최근 15경기</td><td>{recent.pa}</td><td className={cls(recent.ops - all.ops)}><b>{f3(recent.ops)}</b></td><td>{f3(recent.obp)}</td><td>{f3(recent.slg)}</td></tr>}
        </tbody>
      </table></div>
      {est && <p className="legend"><b>앞으로의 기대:</b> 타석당 출루 {f3(est[0])}, 타석당 루타 {f3(est[3])}. 시험해 보니 최근 폼을 섞은 모델이 시즌 누적 기록(표본 보정)보다 나아지지 않아({pk["출루"].best}) 최근 폼은 반영하지 않았습니다. 잘 맞는 시기가 곧바로 이어진다고 보기는 어렵다는 뜻이에요.</p>}
    </>
  );
}

function Method({ si, pl, fo, isBat }) {
  const w = si.meta.wp_models, s = pl.meta.stuff_models, f = fo && fo.meta.models;
  return (
    <details className="explain">
      <summary>이 분석은 어떻게 만들었나</summary>
      <p><b>득점 기대(RE24)</b>: 아웃 수 3 × 주자 8가지 = 24개 상황마다 그 이닝에 남은 평균 득점을 표로 만들고, 타석 전후의 값 차이와 그 타석에서 난 득점을 더했습니다. 마지막 이닝의 끝내기·말 공격은 제외했어요.</p>
      <p><b>승리 확률(WPA)</b>: 이닝·초말·점수차·아웃·주자로 이길 확률을 예측합니다. 경기 단위로 5조각 나눠 교차검증했고(숫자가 작을수록 좋은 로그 손실), 아래 후보 중 가장 좋은 <b>{si.meta.wp_best}</b>를 썼습니다.</p>
      <div className="table-wrap"><table><thead><tr><th>모델</th><th>교차검증</th><th>9월 이후 시험</th></tr></thead>
        <tbody>{Object.entries(w).map(([k, v]) => <tr key={k} className={k === si.meta.wp_best ? "mine" : ""}><td>{k}</td><td>{v.cv}</td><td>{v.test}</td></tr>)}</tbody></table></div>
      {!isBat && <>
        <p><b>구위</b>: 공의 속도·변화량·놓는 위치·구종·좌우 조합만으로 스트라이크(지켜본 + 헛스윙)를 만들 확률을 예측합니다. 8월을 검증, 9월 이후를 시험으로 두었어요. 공이 어디로 갔는지 알려 주면 정확도가 크게 올라가지만(맨 아래 줄), 그건 제구 이야기라서 구위에는 쓰지 않았습니다.</p>
        <div className="table-wrap"><table><thead><tr><th>모델</th><th>검증</th><th>시험</th></tr></thead>
          <tbody>{Object.entries(s).map(([k, v]) => <tr key={k} className={k === pl.meta.stuff_best ? "mine" : ""}><td>{k}</td><td>{v.val}</td><td>{v.test}</td></tr>)}</tbody></table></div>
        <p>공의 물리 값만으로는 리그 평균 예측보다 아주 조금 나아질 뿐이라, 구위 점수는 큰 차이를 말해 주지 못합니다.</p>
      </>}
      {isBat && f && <>
        <p><b>최근 폼</b>: 지금까지 기록(시즌 누적)이나 최근 15경기가 앞으로 15경기의 출루·루타를 얼마나 잘 맞히는지 비교했습니다(평균제곱오차, 작을수록 좋음).</p>
        <div className="table-wrap"><table><thead><tr><th>예측 방법</th><th>출루 검증</th><th>출루 시험</th><th>루타 검증</th><th>루타 시험</th></tr></thead>
          <tbody>{Object.keys(f["출루"]).map(k => <tr key={k}><td>{k}</td><td>{f["출루"][k].val}</td><td>{f["출루"][k].test}</td><td>{f["루타"][k].val}</td><td>{f["루타"][k].test}</td></tr>)}</tbody></table></div>
      </>}
      <p className="legend">원자료: 투구 단위 기록 {pl.meta.pitches.toLocaleString()}개(2026 정규시즌). 변화량·구속·놓는 위치는 측정값 기반의 근사이며 공식 트래킹 수치와 다를 수 있습니다.</p>
    </details>
  );
}
