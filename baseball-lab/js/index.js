/* 메인: 실제 KBO 데이터로 만든 예시 결과 한 장 (규정타석을 채운 타자 중 OPS 1위) */
(async function () {
  BL.renderShell("");
  try {
    const meta = await BL.Api.meta(), q = meta.qualify, season = meta.seasons[0];
    const rows = await BL.Api.batters(season);
    const ops = s => (s.h + s.bb + s.hbp) / (s.ab + s.bb + s.hbp + s.sf) + (s.h + s.d2 + 2 * s.d3 + 3 * s.hr) / s.ab;
    const star = rows.filter(s => s.pa >= q.batterPa).sort((a, b) => ops(b) - ops(a))[0];
    const r = Stats.analyzePlayer("batter", rows, star.pid, ["AVG", "OPS", "HR"], q);
    document.getElementById("pvTitle").textContent = `${r.subject.name} ${season} 타자 분석`;
    document.getElementById("pvBars").innerHTML = View.pctBlock(r.lines);
  } catch (e) {
    document.getElementById("preview").classList.add("hidden");
  }
})();
