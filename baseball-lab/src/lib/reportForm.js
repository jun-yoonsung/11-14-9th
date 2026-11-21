/* 투구 폼(영상) 분석의 PDF 쪽 구성 — report.js의 pageWrap·themed 흐름에 끼워 쓴다. 3D 스켈레톤은 옆·정면·위에서 본 정지 그림(SVG). */
import { esc } from "./format.js";
import { TOKENS } from "./reportTheme.js";
import { CAMS, boundsOf, skeletonSvg } from "./skel.js";
import { JOINTS } from "./form.js";
import { labelsOf, T as TX } from "./formLabels.js";

const T = TOKENS;
export const FORM_CSS = `
  .rp-vw { display: grid; grid-template-columns: 24mm 1fr 1fr 1fr; gap: 0 2mm; align-items: center; border-bottom: 0.5pt solid ${T.line}; padding: 1.5mm 0; }
  .rp-vw:first-of-type { border-top: 0.5pt solid ${T.line}; }
  .rp-vw b { font-size: 9.5pt; } .rp-vw b small { display: block; font-weight: 400; color: ${T.muted}; font-size: 8pt; }
  .rp-vw svg { width: 100%; height: auto; max-height: 40mm; display: block; }
  .rp-vh { display: grid; grid-template-columns: 24mm 1fr 1fr 1fr; gap: 0 2mm; font-size: 8pt; color: ${T.muted}; padding-bottom: 1mm; text-align: center; }
  .rp-seqrow { display: grid; grid-template-columns: 34mm 1fr 16mm; gap: 2mm; align-items: center; font-size: 9pt; margin: 1.6mm 0; }
  .rp-seqrow .tr { position: relative; height: 3mm; background: ${T.fill2}; border-radius: 1.5mm; } .rp-seqrow .tr i { position: absolute; top: -0.5mm; width: 4mm; height: 4mm; border-radius: 50%; background: ${T.accent}; transform: translateX(-50%); }
  .rp-seqrow .tr u { position: absolute; top: -1.2mm; width: 0; height: 5.4mm; border-left: 0.5pt dashed ${T.muted}; }
  .rp-seqrow span { color: ${T.muted}; text-align: right; font-variant-numeric: tabular-nums; }
  .rp-fc { border: 0.75pt solid ${T.line}; border-left: 1.2mm solid ${T.accent}; padding: 3mm 4mm; margin-bottom: 3mm; font-size: 9pt; line-height: 1.55; }
  .rp-fc h3 { font-size: 10.5pt; margin-bottom: 1mm; } .rp-fc h3 em { font-style: normal; font-size: 8pt; color: ${T.muted}; margin-left: 2mm; font-weight: 400; }
  .rp-fc .dir { font-weight: 700; margin: 1mm 0; } .rp-fc p.fine { color: ${T.muted}; font-size: 8pt; line-height: 1.5; margin-top: 0.8mm; }
`;

const SK = { "sk-bone": `stroke="${T.muted}" stroke-width="2.4" stroke-linecap="round"`, "sk-throw": `stroke="${T.accent}" fill="${T.accent}" stroke-width="3.2" stroke-linecap="round"`, "sk-dot": `fill="${T.ink}"`, "sk-head": `fill="none" stroke="${T.muted}" stroke-width="2"` };
const inlineSk = svg => svg.replace(/class="(sk-[a-z]+)"/g, (_, c) => SK[c]);   // html2canvas가 클래스 색을 놓치지 않도록 속성으로 박는다
const VIEW = { side: "옆에서", front: "정면", back: "뒤에서", broadcast: "중계 화면" };

export function formFileName(rec, dateIso) { return `${TX(rec.result.sport).fileName}_${dateIso(rec.createdAt)}.pdf`; }

export function formPages(rec) {
  const r = rec.result, m = r.refMeta, kf = r.keyframes, tx = TX(r.sport), hit = r.sport === "hitting";
  const J = k => Object.fromEntries(JOINTS.map(n => [n, k.joints[n]])), b = boundsOf(kf.map(J));
  const views = Object.entries(CAMS);
  const grid = `<div class="rp-vh"><span></span>${views.map(([, c]) => `<span>${c.label}</span>`).join("")}</div>`
    + kf.map(k => `<div class="rp-vw"><b>${esc(k.label)}<small>${k.t.toFixed(2)}초</small></b>${views.map(([, c]) => inlineSk(skeletonSvg(J(k), c, { w: 120, h: 120, bounds: b }))).join("")}</div>`).join("");
  const p1 = `<h1 class="rp-title">${esc(rec.title)}</h1>
    <p class="rp-meta">영상 분석, ${VIEW[rec.params.view]} 시점, ${tx.hand(rec.params.hand)}${rec.params.heightCm ? `, 키 ${rec.params.heightCm}cm` : ""}. 분석 신뢰도 ${esc(r.conf)}.</p>
    <div class="rp-sec"><h2>핵심 순간의 3D 스켈레톤</h2>${grid}
      <p class="rp-pv" style="margin-top:2mm">영상에서 추정한 관절 12개를 3D로 옮긴 그림이며 영상 화면은 담지 않았습니다. ${tx.armLine.replace("이에요.", "이고")} 머리는 모양을 위한 표시입니다.</p></div>`;
  const use = r.use.length ? `<div class="rp-sec"><h2>관절을 얼마나 썼나</h2><table><thead><tr><th>관절·몸 부위</th><th>움직인 폭</th><th>가장 빠른 변화</th><th>그때(${tx.end} 기준)</th></tr></thead><tbody>${r.use.map(u => `<tr><td>${esc(u.label)}</td><td>${u.range}° (${u.min}°~${u.max}°)</td><td>${u.peakDps}°/초</td><td>${u.peakMs} ms</td></tr>`).join("")}</tbody></table>
    <p class="rp-fine">${tx.start}부터 ${tx.end} 직후까지 구간 값이며 영상 추정이라 참고용입니다. 30fps 영상은 아주 빠른 동작의 속도를 낮게 잡을 수 있습니다.</p></div>` : "";
  const steps = r.sequence.steps, lo = Math.min(-1, ...steps.map(s => s.ms)), hi = Math.max(1, ...steps.map(s => s.ms)), pos = ms => (ms - lo) / (hi - lo) * 100, seq = steps.length ? `<div class="rp-sec"><h2>몸을 쓰는 순서</h2>${steps.map(s => `<div class="rp-seqrow"><b>${esc(s.label)}</b><div class="tr"><u style="left:${pos(0)}%"></u><i style="left:${pos(s.ms)}%"></i></div><span>${s.ms} ms</span></div>`).join("")}
    <p class="rp-fine">세로선이 ${tx.end}(0 ms)이고 점이 가장 빨리 움직인 때입니다. ${tx.seqHint.replace("어요.", "습니다.")} ${r.sequence.ordered === true ? "이 영상은 그 순서와 비슷합니다." : r.sequence.ordered === false ? "이 영상은 순서가 다르게 보이지만 추정 오차일 수 있습니다." : ""}</p></div>` : "";
  const feat = `<div class="rp-sec"><h2>측정한 값</h2><table><thead><tr><th>지표</th><th>내 값</th></tr></thead><tbody>${labelsOf(r.sport).map(([k, l, f]) => `<tr><td>${esc(l)}</td><td>${r.features[k] == null ? "계산 못함" : esc(f(r.features[k]))}</td></tr>`).join("")}</tbody></table></div>`;
  const cards = `<div class="rp-sec"><h2>조정 방향 카드</h2>${r.cards.length ? r.cards.map(c => `<div class="rp-fc"><h3>${esc(c.title)}<em>${esc(c.source === "kbo" ? "KBO 참조" : "모션캡처 참조")}</em></h3>
      <p>${esc(c.mine)}</p><p>${esc(c.target)}</p><p class="dir">${esc(c.direction)}</p><p class="fine">${esc(c.evidence)} 참조 출처: ${esc(c.sourceLabel)}. 이 지표의 영상 신뢰도: ${esc(c.confidence)}.</p><p class="fine">${esc(c.caution)}</p></div>`).join("") : `<div class="rp-callout">${esc(r.conf === "낮음" ? "이 영상은 3D 추정의 신뢰도가 낮아 카드를 만들지 않았습니다." : r.message || "만들어진 카드가 없습니다.")}</div>`}</div>`;
  const sp = r.speed, spd = sp ? `<div class="rp-sec"><h2>참고용 ${hit ? "배트 속도" : "구속"} 범위</h2><div class="rp-callout"><b>약 ${Math.round(sp.mph - sp.rmse)}~${Math.round(sp.mph + sp.rmse)} mph (${Math.round((sp.mph - sp.rmse) * 1.609)}~${Math.round((sp.mph + sp.rmse) * 1.609)} km/h)</b></div>
    <p class="rp-fine">몸 움직임에서 ${hit ? "배트 속도" : "구속"}를 거꾸로 맞춰 본 값이라 오차가 큽니다(교차검증 평균 오차 약 ${sp.rmse} mph). 실제 ${hit ? "배트 속도" : "구속"}는 이보다 훨씬 다를 수 있으니 참고만 하세요.</p></div>` : "";
  const lv = m.playing_levels, lim = `<div class="rp-sec"><h2>꼭 알아 둘 점</h2><ul>
    <li>영상 한 대로 추정한 3D라 모션캡처만큼 정확하지 않고 깊이 방향이 특히 부정확합니다.</li>
    <li>참조 범위는 OpenBiomechanics 모션캡처 ${m.n_trials}${hit ? "스윙" : "투구"}·${m.n_athletes}명(대학 ${lv.college}·독립 ${lv.independent}·고교 ${lv.high_school}·마이너 ${lv.milb})에서 ${hit ? "배트 속도" : "구속"} 상위 1/3의 가운데 절반 범위이며 프로 선수 기준이 아닙니다.</li>
    ${hit ? "<li>이 12개 지표만으로는 배트 속도를 거의 설명하지 못했습니다(교차검증). 카드는 참조 집단과 다른 정도만 보여 주며 배트 속도가 느리다는 뜻이 아닙니다. 배트는 영상에서 추적하지 않습니다.</li>" : ""}
    <li>카드는 방향을 가리킬 뿐 처방이 아니며 체격과 몸 상태에 따라 맞지 않을 수 있습니다. 실제 조정은 코치나 전문가와 상의하세요.</li>
    ${hit ? "" : "<li>KBO 릴리스 높이는 2026 시즌 투수별 평균 궤적에서 구했고, 몸통 길이는 키의 30%로 가정했습니다.</li>"}
    <li>데이터 출처: ${esc(m.source)}. 라이선스 ${esc(m.license)}(비영리·수업 과제용 사용).</li></ul></div>`;
  return [p1, use + seq + feat, cards + spd + lim];
}
