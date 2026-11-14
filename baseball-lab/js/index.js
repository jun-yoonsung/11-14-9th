/* 메인: 실제 샘플 데이터로 만든 예시 결과 한 장 */
(async function () {
  BL.renderShell("");
  try {
    const q = (await BL.Api.meta()).qualify;
    const rows = await BL.Api.batters(2025);
    const r = Stats.analyzePlayer("batter", rows, "B01", ["AVG", "OPS", "HR"], q);
    document.getElementById("pvTitle").textContent = `${r.subject.name} 2025 타자 분석`;
    document.getElementById("pvBars").innerHTML = View.pctBlock(r.lines);
  } catch (e) {
    document.getElementById("preview").classList.add("hidden");
  }
})();
