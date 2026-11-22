import { speedModelText } from "../lib/modelName.js";
import { useMemo } from "react";
import Skeleton3D from "./Skeleton3D.jsx";
import SkeletonSvg from "./SkeletonSvg.jsx";
import FormCards from "./FormCards.jsx";
import KpiStrip from "./KpiStrip.jsx";
import { CAMS, boundsOf } from "../lib/skel.js";
import { JOINTS } from "../lib/form.js";
import { labelsOf, T, lowReasons } from "../lib/formLabels.js";

const toJ = a => Object.fromEntries(JOINTS.map(n => [n, a[n]]));

/** 투구 폼·타격 자세 분석 결과 요약 (분석 기록 result.kind === "form") */
export default function FormSummary({ rec }) {
  const r = rec.result, kfs = r.keyframes, bounds = useMemo(() => boundsOf(kfs.map(k => toJ(k.joints))), [kfs]);
  const sp = r.speed, m = r.refMeta, hit = r.sport === "hitting", tx = T(r.sport);
  return (
    <>
      <KpiStrip r={r} />
      <section className="sec" style={{ marginTop: 28 }}>
        <h2>3D 스켈레톤 돌려 보기</h2>
        <p className="sub">영상에서 추정한 관절 12개를 3D로 옮긴 것입니다. 영상 화면은 저장하지 않아요. 분석 신뢰도 <b>{r.conf}</b>{r.bone.ok ? "" : " (관절 길이가 흔들려 3D 추정이 불안정해요)"}.</p>
        {lowReasons(r).length > 0 && <div className="note warn" role="note"><b>신뢰도가 낮은 이유</b><ul>{lowReasons(r).map(x => <li key={x}>{x}</li>)}</ul></div>}
        <Skeleton3D frames3d={r.frames3d} t={r.series.t} events={r.events} sport={r.sport} />
      </section>
      <section className="sec"><h2>핵심 순간 {kfs.length}장</h2>
        <div className="kf-grid">{kfs.map(k => (
          <figure key={k.label} className="kf"><figcaption><b>{k.label}</b> {k.t.toFixed(2)}초</figcaption>
            <div className="kf-row">{Object.entries(CAMS).map(([ck, cam]) => <SkeletonSvg key={ck} joints={toJ(k.joints)} cam={cam} bounds={bounds} size={120} label={`${k.label} ${cam.label}`} />)}</div></figure>
        ))}</div>
        <p className="note">왼쪽부터 옆에서·정면에서·위에서 본 모습입니다. {tx.armLine}</p>
      </section>
      {!!r.use.length && (
        <section className="sec"><h2>관절을 얼마나 썼나</h2>
          <div className="table-wrap"><table><thead><tr><th>관절·몸 부위</th><th>움직인 폭</th><th>가장 빠른 변화</th><th>그때({tx.end} 기준)</th></tr></thead>
            <tbody>{r.use.map(u => <tr key={u.key}><td>{u.label}</td><td>{u.range}° ({u.min}°~{u.max}°)</td><td>{u.peakDps}°/초</td><td>{u.peakMs} ms</td></tr>)}</tbody></table></div>
          <p className="note">{tx.start}부터 {tx.end} 직후까지 구간 값이며 영상 추정이라 참고용입니다. 30fps 영상은 아주 빠른 동작의 속도를 낮게 잡을 수 있어요.</p></section>
      )}
      {!!r.sequence.steps.length && (
        <section className="sec"><h2>몸을 쓰는 순서</h2>
          <ol className="seq">{r.sequence.steps.map(s => <li key={s.key}><b>{s.label}</b><span>{s.ms} ms</span></li>)}</ol>
          <p className="note">{tx.end}(0 ms)보다 몇 ms 앞서 가장 빨리 움직였는지입니다. {tx.seqHint} {r.sequence.ordered === true ? "이 영상은 그 순서와 비슷합니다." : r.sequence.ordered === false ? "이 영상은 순서가 다르게 보이지만, 추정 오차일 수 있어요." : ""}</p></section>
      )}
      <section className="sec"><h2>측정한 값</h2>
        <div className="table-wrap"><table><thead><tr><th>지표</th><th>내 값</th></tr></thead>
          <tbody>{labelsOf(r.sport).map(([k, l, f]) => <tr key={k}><td>{l}</td><td>{r.features[k] == null ? "계산 못함" : f(r.features[k])}</td></tr>)}</tbody></table></div></section>
      <FormCards cards={r.cards} message={r.message} conf={r.conf} />
      {sp && (
        <section className="sec"><h2>참고용 {hit ? "배트 속도" : "구속"} 범위</h2>
          <p className="headline">약 {Math.round(sp.mph - sp.rmse)}~{Math.round(sp.mph + sp.rmse)} mph ({Math.round((sp.mph - sp.rmse) * 1.609)}~{Math.round((sp.mph + sp.rmse) * 1.609)} km/h)</p>
          <p className="note">몸 움직임에서 {hit ? "배트 속도" : "구속"}를 거꾸로 맞춰 본 값이라 오차가 큽니다{speedModelText(sp.model) && ` (예측 모델: ${speedModelText(sp.model)})`}(교차검증 평균 오차 약 {sp.rmse} mph). 실제 {hit ? "배트 속도" : "구속"}는 이보다 훨씬 다를 수 있으니 참고만 하세요.</p></section>
      )}
      <section className="sec"><h2>꼭 알아 둘 점</h2>
        <ul className="limits">
          <li>영상 한 대로 추정한 3D라 모션캡처만큼 정확하지 않고, 깊이 방향이 특히 부정확합니다.</li>
          <li>참조 범위는 OpenBiomechanics 모션캡처 {m.n_trials}{hit ? "스윙" : "투구"}·{m.n_athletes}명(대학 {m.playing_levels.college}·독립 {m.playing_levels.independent}·고교 {m.playing_levels.high_school}·마이너 {m.playing_levels.milb})에서 {hit ? "배트 속도" : "구속"} 상위 1/3의 가운데 절반 범위입니다. 프로 선수 기준이 아니에요.</li>
          {hit && <li>이 12개 지표만으로는 배트 속도를 거의 설명하지 못했습니다(교차검증 결과). 그래서 카드는 "참조 집단과 다른 정도"만 보여 주며, 다르다고 해서 배트 속도가 느리다는 뜻은 아닙니다. 배트 자체는 영상에서 추적하지 않습니다.</li>}
          <li>카드는 방향을 가리킬 뿐 처방이 아니고, 체격과 몸 상태에 따라 맞지 않을 수 있습니다. 실제 조정은 코치나 전문가와 상의하세요.</li>
          <li>데이터 출처: {m.source}. 라이선스 {m.license}(비영리·수업 과제용 사용).</li>
        </ul></section>
    </>
  );
}
