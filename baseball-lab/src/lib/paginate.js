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
  const pages = [...root.querySelectorAll(".rp-page")];
  for (let i = 0; i < pages.length; i++) {
    let next = null, guard = 0;
    while (over(pages[i]) && bodyOf(pages[i]).length > 1 && guard++ < 30) {   // 블록이 하나뿐이면 더 나눌 수 없다
      if (!next) { next = cont(pages[i]); pages.splice(i + 1, 0, next); }
      const block = bodyOf(pages[i]).pop();
      next.querySelector(".rp-top").after(block);
    }
  }
  pages.forEach((p, i) => { const s = p.querySelectorAll(".rp-foot span"); if (s.length) s[s.length - 1].textContent = `${i + 1} / ${pages.length}`; });
  return pages.length;
}
