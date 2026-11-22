/* 결과 맨 위 핵심 숫자 띠: 분석 신뢰도(링 게이지) + 참고 구속/배트속도 + 착지~릴리스(타격 순간) 간격 + 보폭. 값이 없는 칸은 빼고, 추정 오차는 숫자 옆에 그대로 보여 준다. */
const LEVEL = { 높음: 1, 보통: 0.62, 낮음: 0.3 };

function Ring({ value }) {
  const R = 30, C = 2 * Math.PI * R;
  return (
    <svg className="fkpi-ring" viewBox="0 0 72 72" width="72" height="72" aria-hidden="true">
      <circle cx="36" cy="36" r={R} fill="none" stroke="#efe9e6" strokeWidth="7" />
      <circle cx="36" cy="36" r={R} fill="none" stroke="#c8302a" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${C * value} ${C}`} transform="rotate(-90 36 36)" />
    </svg>
  );
}

export default function KpiStrip({ r }) {
  const hit = r.sport === "hitting", f = r.features, sp = r.speed;
  const gap = hit ? f.fp_to_ct_ms : f.fp_to_br_ms, stride = f.stride_torso;
  return (
    <div className="fkpis" role="list">
      <div className="fkpi fkpi-conf" role="listitem">
        <Ring value={LEVEL[r.conf] ?? 0.3} />
        <div><small>분석 신뢰도</small><b>{r.conf}</b></div>
      </div>
      {sp && <div className="fkpi" role="listitem"><small>참고용 {hit ? "배트 속도" : "구속"}</small><b>{Math.round(sp.mph)}<i> mph</i></b><em>±{Math.round(sp.rmse)} 오차 · 참고만</em></div>}
      {gap != null && <div className="fkpi" role="listitem"><small>{hit ? "착지 → 타격 순간" : "착지 → 릴리스"}</small><b>{Math.round(gap)}<i> ms</i></b></div>}
      {stride != null && <div className="fkpi" role="listitem"><small>보폭</small><b>{stride.toFixed(2)}<i> ×몸통</i></b></div>}
    </div>
  );
}
