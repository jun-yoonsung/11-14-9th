/* 공통: 브라우저 저장소 보호, 체험 로그인, 분석 기록, JSON 데이터 읽기, 화면 조각 */
(function () {
  "use strict";

  // ---------- 저장소 (막혀 있으면 이 페이지 안에서만 임시 사용) ----------
  const mem = {};
  const Safe = {
    get(k) { try { const v = localStorage.getItem(k); if (v !== null) return v; } catch (e) {} return k in mem ? mem[k] : null; },
    set(k, v) { mem[k] = v; try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { delete mem[k]; try { localStorage.removeItem(k); } catch (e) {} },
    getJSON(k, fallback) { try { const v = this.get(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
    setJSON(k, v) { this.set(k, JSON.stringify(v)); },
  };

  // ---------- 체험 로그인 (입력 없이 버튼만 누르면 로그인) ----------
  const Auth = {
    KEY: "bl_auth",
    isIn() { const a = Safe.getJSON(this.KEY, null); return !!(a && a.loggedIn === true); },
    login() { Safe.setJSON(this.KEY, { loggedIn: true, name: "체험 사용자" }); },
    logout() { Safe.del(this.KEY); },
    name() { const a = Safe.getJSON(this.KEY, null); return (a && a.name) || "체험 사용자"; },
    // 로그인이 필요한 화면에서 호출. 로그인 전이면 로그인 화면으로 보내고, 로그인 후 원래 화면으로 돌아오게 한다.
    require() {
      if (this.isIn()) return true;
      const here = location.pathname.split("/").pop() + location.search;
      location.replace("login.html?next=" + encodeURIComponent(here));
      return false;
    },
    nextUrl() {
      const n = new URLSearchParams(location.search).get("next");
      return n && /^[\w.\-]+\.html(\?[\w=&%.\-]*)?$/.test(n) ? n : "analyze.html";
    },
  };

  // ---------- 분석 기록 (이 브라우저에 저장) ----------
  const Store = {
    KEY: "bl_history",
    WIZ: "bl_wizard",
    list() { const l = Safe.getJSON(this.KEY, []); return Array.isArray(l) ? l : []; },
    add(rec) { const l = this.list(); l.push(rec); Safe.setJSON(this.KEY, l); return rec; },
    get(id) { return this.list().find(r => r.id === id) || null; },
    remove(id) { Safe.setJSON(this.KEY, this.list().filter(r => r.id !== id)); },
    newId() { return "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
    wizard() { return Safe.getJSON(this.WIZ, {}) || {}; },
    saveWizard(w) { Safe.setJSON(this.WIZ, w); },
    clearWizard() { Safe.del(this.WIZ); },
  };

  // ---------- 샘플 데이터 읽기 (data/*.json이 백엔드·DB 역할) ----------
  const cache = {};
  const Api = {
    async json(name) {
      if (!cache[name]) {
        cache[name] = fetch("data/" + name + ".json").then(r => {
          if (!r.ok) throw new Error(name + " " + r.status);
          return r.json();
        });
      }
      return cache[name];
    },
    meta() { return this.json("meta"); },
    batters(season) { return this.json("batters").then(l => l.filter(x => x.season === season)); },
    pitchers(season) { return this.json("pitchers").then(l => l.filter(x => x.season === season)); },
    teams(season) { return this.json("teams").then(l => l.filter(x => x.season === season)); },
  };

  // ---------- 화면 조각 ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const BALL = '<svg class="ball" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="#fff" stroke="#121a2b" stroke-width="1.5"/><path d="M6.2 4.2c2.6 2.8 2.6 12.8 0 15.6M17.8 4.2c-2.6 2.8-2.6 12.8 0 15.6" fill="none" stroke="#c8302a" stroke-width="1.6" stroke-dasharray="2 1.6"/></svg>';

  let toastTimer;
  function toast(msg) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  }

  function renderShell(active) {
    const loggedIn = Auth.isIn();
    const cur = n => (active === n ? ' aria-current="page"' : "");
    document.body.insertAdjacentHTML("afterbegin", `
      <header class="site-head"><div class="wrap head-in">
        <a class="logo" href="index.html">${BALL}<span>야구 분석 랩</span></a>
        <nav class="tabs" aria-label="주 메뉴">
          <a href="analyze.html"${cur("analyze")}>데이터 분석</a>
          <a href="history.html"${cur("history")}>분석 기록</a>
        </nav>
        <div class="who">${loggedIn
          ? `<span class="name">${esc(Auth.name())}</span><button class="linkbtn" id="logoutBtn" type="button">로그아웃</button>`
          : `<a class="linkbtn" href="login.html">로그인</a>`}</div>
      </div></header>`);
    const out = document.getElementById("logoutBtn");
    if (out) out.addEventListener("click", () => { Auth.logout(); location.href = "index.html"; });
    const foot = document.getElementById("siteFoot");
    if (foot) foot.innerHTML = '<div class="wrap">화면의 선수와 팀 기록은 실습용 가상 샘플 데이터입니다. 분석 기록은 이 브라우저에만 저장됩니다.</div>';
    // 로그아웃 뒤 뒤로 가기로 돌아왔을 때 보호 화면이 남아 보이지 않게 한다
    window.addEventListener("pageshow", e => {
      if (e.persisted && document.body.dataset.protected === "1" && !Auth.isIn()) Auth.require();
    });
  }

  window.BL = { Safe, Auth, Store, Api, esc, toast, renderShell, BALL };
})();

// 설치 가능한 웹앱: 서비스 워커 등록 (http 서버나 https에서만 동작)
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
}
