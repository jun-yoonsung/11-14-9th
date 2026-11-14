/* 분석 기록: 목록, 정렬, 다시 열기, 삭제 */
(function () {
  "use strict";
  if (!BL.Auth.require()) return;
  BL.renderShell("history");
  const { Store, esc, toast } = BL;
  const view = document.getElementById("view");
  let order = "new";      // new | old
  let confirmId = null;   // 삭제 확인 중인 기록

  const tagClass = { batter: "bat", pitcher: "pit", team: "team" };

  function metricLabels(rec) {
    const r = rec.result;
    return (r.kind === "team" ? r.metrics : r.lines).map(x => x.label).join(", ");
  }

  function render() {
    const list = Store.list().slice().sort((a, b) => (order === "new" ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt)));
    if (!list.length) {
      view.innerHTML = `<div class="empty">${BL.BALL}<h1>아직 분석 기록이 없습니다</h1>
        <p class="sub">분석을 하면 결과가 여기에 자동으로 저장돼요.</p>
        <a class="btn pri" href="analyze.html">첫 분석 시작하기</a></div>`;
      return;
    }
    view.innerHTML = `
      <div class="list-top">
        <div><h1>분석 기록</h1><p class="sub">${list.length}개, 이 브라우저에만 저장됩니다.</p></div>
        <div class="seg2" role="group" aria-label="정렬">
          <button type="button" data-order="new" aria-pressed="${order === "new"}">최신순</button>
          <button type="button" data-order="old" aria-pressed="${order === "old"}">오래된순</button>
        </div>
      </div>
      <ul class="hist">${list.map(rec => `
        <li>
          <a class="t" href="result.html?id=${encodeURIComponent(rec.id)}">${esc(rec.title)}</a>
          <div class="ops">${confirmId === rec.id
            ? `<span class="confirm">이 기록을 삭제할까요?</span><button class="btn small" type="button" data-del="${rec.id}" style="color:#c8302a;border-color:#c8302a">삭제</button><button class="btn small" type="button" data-cancel>취소</button>`
            : `<button class="linkbtn" type="button" data-ask="${rec.id}" style="color:#5c667d" aria-label="${esc(rec.title)} 삭제">삭제</button>`}</div>
          <div class="meta"><span class="tag ${tagClass[rec.type]}">${Stats.TYPES[rec.type].short}</span>${esc(View.dateKo(rec.createdAt))}, ${esc(metricLabels(rec))}</div>
        </li>`).join("")}</ul>`;
  }

  view.addEventListener("click", e => {
    const o = e.target.closest("[data-order]");
    if (o) { order = o.dataset.order; render(); return; }
    const ask = e.target.closest("[data-ask]");
    if (ask) { confirmId = ask.dataset.ask; render(); return; }
    if (e.target.closest("[data-cancel]")) { confirmId = null; render(); return; }
    const del = e.target.closest("[data-del]");
    if (del) { Store.remove(del.dataset.del); confirmId = null; render(); toast("분석 기록을 삭제했습니다."); }
  });

  render();
})();
