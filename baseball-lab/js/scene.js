/* 움직이는 야구장 배경: 메인은 야구장 전경, 타자 분석은 타격 장면, 투수 분석은 투구 장면.
   그림은 모두 SVG + CSS 애니메이션이라 이미지 파일이 없고, 움직임을 줄이는 설정이면 멈춘다. */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  // ---------- 공통 바탕: 해 질 녘 하늘, 관중석, 조명탑, 잔디 ----------
  function crowd() {
    let s = "";
    for (let i = 0; i < 170; i++) {
      const x = 20 + rnd() * 1560, y = 438 + rnd() * 112, r = 1.2 + rnd() * 1.6;
      s += `<circle class="cw c${i % 4}" cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" style="animation-delay:${(rnd() * 4).toFixed(2)}s"/>`;
    }
    return s;
  }
  function stripes() {
    let s = "";
    for (let i = 0; i < 12; i++) {   // 지평선에서 아래로 퍼지는 잔디 줄무늬
      const a = i / 12, b = (i + 1) / 12, x0 = 800 + (a - 0.5) * 1000, x1 = 800 + (b - 0.5) * 1000;
      const y0 = 800 + (a - 0.5) * 3200, y1 = 800 + (b - 0.5) * 3200;
      s += `<polygon fill="${i % 2 ? "#17593f" : "#1c6a4a"}" points="${x0},590 ${x1},590 ${y1},900 ${y0},900"/>`;
    }
    return s;
  }
  const towers = [260, 800, 1340].map((x, i) => `<g class="tw" style="animation-delay:${i * 0.9}s"><rect x="${x - 4}" y="300" width="8" height="270" fill="#0a1226"/><rect x="${x - 46}" y="262" width="92" height="42" rx="4" fill="#0a1226"/>
    ${[-30, -10, 10, 30].map(d => `<circle class="lamp" cx="${x + d}" cy="${(i % 2 ? 276 : 283)}" r="6" fill="#fff6d6"/><circle class="glow" cx="${x + d}" cy="${(i % 2 ? 276 : 283)}" r="26" fill="url(#gl)"/>`).join("")}</g>`).join("");

  const base = `
    <defs>
      <linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070d22"/><stop offset=".55" stop-color="#27408c"/><stop offset="1" stop-color="#e0734e"/></linearGradient>
      <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a6a4a"/><stop offset="1" stop-color="#0b3a2a"/></linearGradient>
      <radialGradient id="gl"><stop offset="0" stop-color="#fff3c4" stop-opacity=".9"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></radialGradient>
      <radialGradient id="vg" cx=".5" cy=".55" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>
    </defs>
    <rect width="1600" height="900" fill="url(#sk)"/>
    <g class="stars">${Array.from({ length: 40 }, (_, i) => `<circle cx="${(rnd() * 1600).toFixed(0)}" cy="${(rnd() * 240).toFixed(0)}" r="1.2" fill="#fff" class="cw c${i % 4}" style="animation-delay:${(rnd() * 5).toFixed(1)}s"/>`).join("")}</g>
    <path d="M0 470 Q400 420 800 440 T1600 470 V590 H0Z" fill="#0b1630"/>
    ${crowd()}
    ${towers}
    <rect y="572" width="1600" height="22" fill="#0d3b2c"/><rect y="572" width="1600" height="4" fill="#1d7a58" opacity=".6"/>
    <rect y="590" width="1600" height="310" fill="url(#gr)"/>${stripes()}`;
  const dirt = `<polygon points="800,640 1010,800 800,900 590,800" fill="#a0603a" opacity=".92"/><polygon points="800,668 960,800 800,880 640,800" fill="#1a6a4a"/>
    <polygon points="800,792 826,806 818,822 782,822 774,806" fill="#fff" opacity=".95"/>`;
  const finish = `<rect width="1600" height="900" fill="url(#vg)"/>`;

  // ---------- 장면 1: 야구장 전경 ----------
  const stadium = `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g class="cam">
    ${base}
    <g class="beam b1"><polygon points="260,283 60,590 520,590" fill="#fff4cf"/></g>
    <g class="beam b2"><polygon points="1340,283 1100,590 1540,590" fill="#fff4cf"/></g>
    ${dirt}
    <g class="hit"><g class="hit-y"><circle r="9" fill="#fff"/><path d="M-6-5q4 5 0 10M6-5q-4 5 0 10" stroke="#d8362f" stroke-width="1.6" fill="none"/></g></g>
    <g class="dust">${Array.from({ length: 22 }, (_, i) => `<circle cx="${(rnd() * 1600).toFixed(0)}" cy="${(300 + rnd() * 560).toFixed(0)}" r="${(1 + rnd() * 2).toFixed(1)}" fill="#fff" style="animation-delay:${(rnd() * 12).toFixed(1)}s;animation-duration:${(10 + rnd() * 10).toFixed(1)}s"/>`).join("")}</g>
    </g>${finish}</svg>`;

  // ---------- 장면 2: 타자 타격 (옆모습 실루엣, 스윙 → 공이 맞고 날아감) ----------
  const batter = `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g class="shake">
    ${base}${dirt}
    <ellipse cx="640" cy="830" rx="150" ry="22" fill="#000" opacity=".35"/>
    <polygon points="650,826 690,832 684,846 656,846" fill="#fff" opacity=".95"/>
    <g class="bt-body">
      <path d="M498 828 L486 700 L512 700 L528 828Z" fill="#050b18"/>
      <path d="M560 828 L548 700 L574 696 L592 828Z" fill="#050b18"/>
      <path d="M488 706 Q540 720 580 702 L586 590 Q540 560 502 590Z" fill="#050b18"/>
      <circle cx="540" cy="540" r="26" fill="#050b18"/><path d="M510 530 Q540 500 574 524 L578 534 L520 532Z" fill="#050b18"/>
      <g class="bt-bat" style="transform-origin:548px 600px"><path d="M552 606 L548 430 Q546 400 556 392 L560 392 Q570 400 566 430 L562 606Z" fill="#0a1020"/><rect x="544" y="584" width="26" height="34" rx="8" fill="#050b18"/></g>
    </g>
    <g class="bt-ball"><circle r="9" fill="#fff"/><path d="M-6-5q4 5 0 10M6-5q-4 5 0 10" stroke="#d8362f" stroke-width="1.6" fill="none"/></g>
    <g class="bt-trail"><path d="M0 0 L-180 70" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/></g>
    <circle class="flash" cx="690" cy="498" r="40" fill="none" stroke="#fff" stroke-width="5"/><circle class="flash f2" cx="690" cy="498" r="22" fill="#fff6d6"/>
    </g>${finish}</svg>`;

  // ---------- 장면 3: 투수 투구 (포수 시점, 와인드업 → 공이 카메라로 날아옴) ----------
  const pitcher = `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g class="push">
    ${base}
    <ellipse cx="800" cy="612" rx="120" ry="16" fill="#a0603a"/><rect x="778" y="606" width="44" height="6" rx="2" fill="#fff" opacity=".9"/>
    <g class="pt-body">
      <g class="pt-leg2" style="transform-origin:806px 548px"><path d="M796 548 L810 548 L822 606 L806 606Z" fill="#050b18"/></g>
      <path d="M782 548 L798 548 L792 606 L776 606Z" fill="#050b18"/>
      <g class="pt-torso" style="transform-origin:800px 548px"><path d="M776 552 L824 552 L828 478 Q800 466 772 478Z" fill="#050b18"/><circle cx="800" cy="458" r="14" fill="#050b18"/><path d="M786 454 Q800 438 816 452Z" fill="#050b18"/>
        <path d="M772 484 L758 520 L766 524 L782 494Z" fill="#050b18"/>
        <g class="pt-arm" style="transform-origin:822px 486px"><path d="M818 482 L828 484 L832 548 L822 550Z" fill="#050b18"/><circle class="pt-hand" cx="827" cy="554" r="7" fill="#fff"/></g>
      </g>
    </g>
    <g class="pt-ball"><circle r="10" fill="#fff"/><path d="M-7-5q5 5 0 10M7-5q-5 5 0 10" stroke="#d8362f" stroke-width="1.8" fill="none"/></g>
    <g class="pt-lines"><path d="M800 470 L800 900 M780 480 L700 900 M820 480 L900 900" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".55"/></g>
    <circle class="pop" cx="800" cy="860" r="60" fill="url(#gl)"/>
    </g>${finish}</svg>`;

  const SCENES = { stadium, batter, pitcher };
  let root = null, current = "";

  function mount() {
    if (root || !document.body) return;
    root = document.createElement("div");
    root.className = "scene"; root.setAttribute("aria-hidden", "true");
    root.innerHTML = Object.keys(SCENES).map(k => `<div class="sc sc-${k}" data-sc="${k}"></div>`).join("");
    document.body.insertBefore(root, document.body.firstChild);
    document.body.classList.add("has-scene");
    if (document.querySelector(".hero-wrap")) document.body.classList.add("home");
  }
  // 장면은 처음 보일 때 한 번만 그린다 (보이지 않는 장면의 애니메이션은 돌리지 않는다)
  function set(name) {
    if (!SCENES[name]) name = "stadium";
    mount();
    const el = root.querySelector(".sc-" + name);
    if (el && !el.firstChild) el.innerHTML = SCENES[name];
    if (name === current) return;
    current = name;
    root.querySelectorAll(".sc").forEach(n => n.classList.toggle("on", n === el));
    document.body.dataset.scene = name;
  }
  window.BL.Scene = { set };
  set(document.body.dataset.scene || "stadium");
})();
