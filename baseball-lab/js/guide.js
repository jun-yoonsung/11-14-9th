/* 지표 설명: 사이트에서 쓰는 지표의 뜻과 계산식을 한곳에 모아 보여 준다 (정의는 detail.js와 같은 값을 쓴다) */
(function () {
  "use strict";
  BL.renderShell("guide");
  const { esc } = BL;
  const sect = (title, defs) => `<section class="sec"><h2>${title}</h2>` + defs.map(d => `<div class="gd-card"><h3>${esc(d.label)} <small class="muted">${esc(d.en)}</small></h3>
      <p>${esc(d.desc)} ${d.better === "low" ? "<b>낮을수록 좋습니다.</b>" : ""}</p><p class="note">계산식: <code>${esc(d.how)}</code></p></div>`).join("") + "</section>";
  let Q = { batterPa: 446, pitcherOuts: 432 };
  const ex = () => [
    ["존 안·존 밖", "존 안은 홈플레이트 폭(좌우 ±0.83ft, 공 반지름 포함) 안이고 위아래는 타자마다 다른 존(공 반지름 포함) 안입니다. 그 밖은 존 밖입니다. 투구 추적 좌표로 직접 나눈 값이라 공식 판정과 다를 수 있습니다."],
    ["스윙·헛스윙", "스윙은 헛스윙, 파울, 타격(인플레이)을 합친 것이고, 헛스윙은 그중 배트에 맞지 않은 공입니다. 번트 시도는 따로 구분하지 않았습니다."],
    ["규정 타석·이닝", `타자는 경기 수 × 3.1타석(${Q.batterPa}), 투수는 경기 수 × 1이닝(${Math.round(Q.pitcherOuts / 3)}이닝) 이상을 규정으로 봅니다. 리그 평균과 순위, 백분위는 규정을 채운 선수끼리 계산합니다.`],
    ["상대 타자 수", "투수 K%, BB%의 분모는 아웃 수 + 피안타 + 볼넷 + 사구로 근사한 값이라 공식 타자 수와 조금 다를 수 있습니다."],
    ["백분위", "규정을 채운 선수 중 나보다 못한 선수의 비율입니다. 91이면 91%보다 좋은 기록이라는 뜻이고, 낮을수록 좋은 지표(ERA 등)도 같은 방향으로 맞춥니다."],
    ["자동 유형(군집)", "순위 화면의 군집은 K-평균이라는 방법으로 비슷한 선수끼리 묶은 것입니다. 묶을 개수(2~6)는 실루엣 점수(묶음이 얼마나 뚜렷한지, -1~1)가 가장 높은 쪽을 고르고, 이름은 평균보다 뚜렷이 높거나 낮은 지표를 나열해 자동으로 붙입니다."],
    ["이 사이트의 한계", "2루타·3루타·사구·희생플라이는 투구별 기록의 타석 결과에서 세어 공식 기록과 소폭 다를 수 있습니다. 회전수 같은 장비 측정값은 데이터에 없어 제공하지 않습니다."],
  ];
  const render = () => {
    document.getElementById("view").innerHTML = `<div class="result-head"><h1>지표 설명</h1><p class="sub">이 사이트에서 쓰는 지표의 뜻과 계산식입니다. 모르는 용어를 만나면 여기로 오세요.</p></div>
      ${sect("타자 지표", Detail.CFG.batter.defs)}${sect("투수 지표", Detail.CFG.pitcher.defs)}
      <section class="sec"><h2>용어와 계산 기준</h2>${ex().map(e => `<div class="gd-card"><h3>${e[0]}</h3><p>${esc(e[1])}</p></div>`).join("")}</section>`;
  };
  BL.Api.meta().then(m => { Q = m.qualify; }).catch(() => {}).then(render);
})();
