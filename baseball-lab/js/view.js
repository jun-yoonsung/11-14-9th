/* 화면 조각: 결과 화면과 메인 예시가 함께 쓰는 리그 내 위치 막대 등 */
(function () {
  "use strict";
  const esc = BL.esc;

  const beadColor = p => (p >= 70 ? "#c8302a" : p <= 30 ? "#2f5bd3" : "#6f7a91");
  const topText = l => (l.pct == null ? "-" : `상위 ${100 - l.pct}%`);
  const dateKo = iso => { const d = new Date(iso); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`; };
  const dateIso = iso => { const d = new Date(iso); const z = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };

  // 리그 내 위치 한 줄: 파랑(하위)에서 빨강(상위)으로 이어지는 막대 위에 구슬로 위치를 표시
  function pctRow(l) {
    const head = `<b>${esc(l.label)}${l.label !== l.en ? `<small>${esc(l.en)}</small>` : ""}</b>`;
    if (l.pct == null) return `<div class="pct">${head}<div class="sub">기록이 없어 위치를 표시하지 않습니다.</div><div class="pct-val"><b>-</b></div></div>`;
    const label = `${l.label} 리그 ${topText(l)}`;
    return `<div class="pct" role="img" aria-label="${esc(label)}">${head}
      <div class="pct-track"><span class="pct-bead" style="left:clamp(15px,${l.pct}%,calc(100% - 15px));background:${beadColor(l.pct)}">${l.pct}</span></div>
      <div class="pct-val"><b>${esc(l.display)}</b> (리그 평균 ${esc(l.leagueDisplay)})</div></div>`;
  }
  const pctScale = `<div class="pct-scale" aria-hidden="true"><div></div><div><span>하위</span><span>평균</span><span>상위</span></div><div></div></div>`;
  const pctBlock = lines => `<div class="pcts">${lines.map(pctRow).join("")}${lines.some(l => l.pct != null) ? pctScale : ""}</div>`;

  window.View = { pctRow, pctBlock, pctScale, beadColor, topText, dateKo, dateIso };
})();
