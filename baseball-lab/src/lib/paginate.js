/* PDF 쪽 넘침 보정: 한 쪽에 다 들어가지 않는 마지막 블록을 새 쪽(같은 머리말·꼬리말)으로 넘긴다.
 * 문장이 길거나 지표가 많아 내용이 바닥글을 덮는 일을 막는다. 화면에 붙인 뒤(높이를 잴 수 있을 때) 한 번 호출한다. */
export function paginate(root) {
  const bodyOf = page => [...page.children].filter(c => !c.classList.contains("rp-top") && !c.classList.contains("rp-foot"));
  const over = page => { const b = bodyOf(page), f = page.querySelector(".rp-foot"); return b.length > 0 && !!f && b[b.length - 1].getBoundingClientRect().bottom > f.getBoundingClientRect().top - 2; };
  const cont = page => {
    const n = document.createElement("section"); n.className = page.className;
    n.append(page.querySelector(".rp-top").cloneNode(true), page.querySelector(".rp-foot").cloneNode(true));
    page.after(n); return n;
  };
  // 한 블록이 한 쪽보다 길면(지표를 많이 고른 목록·표 등) 항목 단위로 쪼개 다음 쪽에 "(이어서)"로 잇는다
  const KINDS = [[".rp-pcts", ".rp-pct"], [".rp-kpis", ".rp-kpi"], ["tbody", "tr"], ["ul", "li"]];
  const splitLast = (page, next) => {
    const blk = bodyOf(page).pop();
    if (!blk) return false;
    // 쪼갤 수 있는 상자 중 가장 키가 큰 것을 고른다 (짧은 목록이 앞에 있어도 긴 목록을 나눈다)
    let pick = null;
    for (const [cs, is] of KINDS) for (const box of blk.querySelectorAll(cs)) {
      const items = [...box.children].filter(c => c.matches(is)), h = box.getBoundingClientRect().height;
      if (items.length >= 2 && (!pick || h > pick.h)) pick = { cs, is, box, items, h };
    }
    if (pick) {
      const { cs, box, items } = pick;
      // 이어질 블록: 제목과 항목 상자의 빈 껍데기만 복제 (설명 문단 등은 원래 블록에만 둔다)
      const sec = box.closest(".rp-sec") || blk, shell = blk.cloneNode(false), host = sec === blk ? shell : sec.cloneNode(false);
      if (host !== shell) shell.append(host);
      let h2 = null;   // 상자 바로 앞에 있는 제목(없으면 블록의 첫 제목)
      for (let e = box.previousElementSibling; e && !h2; e = e.previousElementSibling) if (e.tagName === "H2") h2 = e;
      h2 = h2 || sec.querySelector("h2");
      if (h2) { const hc = h2.cloneNode(true); if (!/이어서/.test(hc.textContent)) hc.textContent += " (이어서)"; host.append(hc); }
      let boxClone;
      if (cs === "tbody") {
        const table = box.closest("table"), t = table.cloneNode(false), th = table.querySelector("thead");
        if (th) t.append(th.cloneNode(true));
        boxClone = box.cloneNode(false); t.append(boxClone); host.append(t);
      } else { boxClone = box.cloneNode(false); host.append(boxClone); }
      let moved = 0;
      while (over(page) && items.length - moved > 1) { boxClone.prepend(items[items.length - 1 - moved]); moved++; }
      if (!moved) return false;
      next.querySelector(".rp-top").after(shell);
      return true;
    }
    return false;
  };
  const pages = [...root.querySelectorAll(".rp-page")];
  for (let i = 0; i < pages.length; i++) {
    let next = null, guard = 0;
    while (over(pages[i]) && guard++ < 40) {
      if (!next) { next = cont(pages[i]); pages.splice(i + 1, 0, next); }
      if (bodyOf(pages[i]).length > 1) { next.querySelector(".rp-top").after(bodyOf(pages[i]).pop()); continue; }
      if (!splitLast(pages[i], next)) break;   // 더 쪼갤 수 없으면 그대로 둔다
    }
    if (next && !bodyOf(next).length) { next.remove(); pages.splice(i + 1, 1); }
  }
  pages.forEach((p, i) => { const s = p.querySelectorAll(".rp-foot span"); if (s.length) s[s.length - 1].textContent = `${i + 1} / ${pages.length}`; });
  return pages.length;
}
