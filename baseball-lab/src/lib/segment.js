/* 영상에서 분석할 사람 고르기·따라가기와 투구 구간 제안 (순수 함수).
 * 프레임: {t, j(월드 좌표 12관절|null), img(화면 좌표|null), all:[{j,img}]} — pose.js scan()의 결과. */
import { JOINTS } from "./form.js";

const LOST_DIST = 0.2;          // 직전 위치(화면 비율)에서 이보다 멀면 같은 사람이 아니다
const MIN_PEAK_MPS = 2.0;       // 던지는 손목 최고 속도가 이보다 느리면 투구가 아니다
const PRE_S = 1.5, POST_S = 1.0, MIN_WINDOW_S = 0.8;

export const center = img => { let x = 0, y = 0; for (const n of JOINTS) { x += img[n].x; y += img[n].y; } return [x / JOINTS.length, y / JOINTS.length]; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const poseGap = (a, b) => JOINTS.reduce((s, n) => s + Math.hypot(a[n].x - b[n].x, a[n].y - b[n].y, a[n].z - b[n].z), 0) / JOINTS.length;
const wristName = hand => (hand === "L" ? "lwri" : "rwri");

/** 첫 장면에서 사람이 정확히 1명일 때 그 사람의 화면 중심 [x,y]. 0명 또는 2명 이상이면 null (all 항목은 {j, img}) */
export function soleSeed(all) { return all && all.length === 1 ? center(all[0].img) : null; }

/** 사람이 화면에서 작을 때(키가 화면의 45% 미만) 그 사람이 움직이는 범위를 여유 있게 감싼 잘라내기 상자 {x,y,w,h}(화면 비율). 크거나 못 찾으면 null.
 *  aspect = 영상 가로/세로 픽셀 비. 상자는 화소로 정사각형에 가깝게 만들고 화면 안으로 밀어 넣는다. 작은 사람은 이 상자만 확대해 다시 추정하면 관절이 더 정확하다. */
export function cropRect(frames, { aspect = 1, pad = 0.35, maxHeight = 0.45 } = {}) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, tall = 0, any = false;
  for (const f of frames || []) {
    if (!f.img) continue;
    let a = Infinity, b = -Infinity;
    for (const n of JOINTS) { const p = f.img[n]; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); a = Math.min(a, p.y); b = Math.max(b, p.y); any = true; }
    tall = Math.max(tall, b - a);
  }
  if (!any || tall >= maxHeight) return null;
  const side = Math.min(1, Math.max((x1 - x0) * aspect, y1 - y0) * (1 + 2 * pad));   // 세로 비율 단위의 한 변
  const w = Math.min(1, side / aspect), h = Math.min(1, side);
  const x = Math.min(Math.max((x0 + x1) / 2 - w / 2, 0), 1 - w), y = Math.min(Math.max((y0 + y1) / 2 - h / 2, 0), 1 - h);
  return { x, y, w, h };
}

/** 잘라낸 화면 기준 좌표(0~1)를 전체 화면 좌표로 되돌린다 */
export function uncrop(img, c) {
  if (!img) return img;
  return Object.fromEntries(Object.entries(img).map(([n, p]) => [n, { ...p, x: c.x + p.x * c.w, y: c.y + p.y * c.h }]));
}

/** 클릭한 위치(화면 비율)에 가장 가까운 사람의 번호. 사람이 없으면 -1 */
export function pickPerson(first, x, y) {
  let best = -1, bd = Infinity;
  (first.all || []).forEach((p, i) => { const d = dist(center(p.img), [x, y]); if (d < bd) { bd = d; best = i; } });
  return best;
}

/** 고른 사람을 프레임마다 이어 붙인다. 다음 위치는 직전 위치+속도로 예측해 가장 가까운(자세도 비슷한) 사람을 고르고,
 *  너무 멀면 놓친 것으로 보고 {j:null, img:null}로 둔다. */
export function follow(frames, seedIndex) {
  let prev = null, vel = [0, 0], prevJ = null;
  return frames.map((f, k) => {
    const cands = f.all || [];
    if (k === 0) {
      const p = cands[seedIndex];
      if (!p) return { t: f.t, j: null, img: null };
      prev = center(p.img); prevJ = p.j;
      return { t: f.t, j: p.j, img: p.img };
    }
    if (!prev) return { t: f.t, j: null, img: null };
    const pred = [prev[0] + vel[0], prev[1] + vel[1]];
    let best = null, bc = Infinity;
    for (const p of cands) { const c = center(p.img), cost = dist(c, pred) + 0.02 * poseGap(p.j, prevJ); if (cost < bc) { bc = cost; best = { p, c }; } }
    if (!best || dist(best.c, prev) > LOST_DIST) { vel = [0, 0]; return { t: f.t, j: null, img: null }; }
    vel = [best.c[0] - prev[0], best.c[1] - prev[1]]; prev = best.c; prevJ = best.p.j;
    return { t: f.t, j: best.p.j, img: best.p.img };
  });
}

/** 손목 속도(m/s). 직전 유효 프레임과의 거리 ÷ 시간. 놓친 프레임은 0 */
export function wristSpeed(frames, hand) {
  const name = wristName(hand); let last = null;
  return frames.map(f => {
    if (!f.j) return 0;
    const w = f.j[name], s = last ? Math.hypot(w.x - last.w.x, w.y - last.w.y, w.z - last.w.z) / Math.max(f.t - last.t, 1e-6) : 0;
    last = { w, t: f.t };
    return s;
  });
}

/** 두 손목 중 최고 속도가 큰 쪽이 던지는 손 */
export function detectHand(frames) {
  const r = Math.max(0, ...wristSpeed(frames, "R")), l = Math.max(0, ...wristSpeed(frames, "L"));
  return l > r ? "L" : "R";
}

/** 던지는 손목 속도가 가장 큰 때(릴리스)를 찾아 앞 1.5초~뒤 1.0초를 영상 범위 안에서 제안한다. 못 찾거나 0.8초보다 짧으면 null */
export function suggestWindow(frames, hand /*, fps */) {
  const sp = wristSpeed(frames, hand);
  if (!sp.length) return null;
  let pk = 0; sp.forEach((v, i) => { if (v > sp[pk]) pk = i; });
  if (sp[pk] < MIN_PEAK_MPS) return null;
  const moving = sp.filter(v => v > 0).sort((a, b) => a - b), med = moving.length ? moving[Math.floor(moving.length / 2)] : 0;
  const release = frames[pk].t, t0 = frames[0].t, t1 = frames[frames.length - 1].t;
  const start = Math.max(t0, release - PRE_S), end = Math.min(t1, release + POST_S);
  if (end - start < MIN_WINDOW_S) return null;
  const valid = frames.filter(f => f.j).length / frames.length, ratio = med > 0 ? sp[pk] / med : Infinity;
  const confidence = valid >= 0.9 && ratio > 6 ? "높음" : valid >= 0.7 && ratio > 3 ? "보통" : "낮음";
  return { start, end, release, confidence };
}

// ---- 타격 자세: 양손 속도 정점(스윙)을 찾아 앞 1.2초~뒤 0.6초를 제안한다 ----
const SWING_PRE_S = 1.2, SWING_POST_S = 0.6;

/** 앞쪽(투수 쪽) 발이 더 크게 들리는 쪽으로 타석을 추정한다: 앞발이 왼발이면 우타자("R"). 월드 y는 위 + */
export function detectSide(frames) {
  const rise = n => { const ys = frames.filter(f => f.j).map(f => f.j[n].y); return ys.length ? Math.max(...ys) - Math.min(...ys) : 0; };
  return rise("rank") > rise("lank") ? "L" : "R";
}

/** 양 손목 평균 위치의 속도가 가장 큰 때를 스윙으로 보고 구간을 제안한다. 못 찾거나 0.8초보다 짧으면 null */
export function suggestSwingWindow(frames /*, fps */) {
  let last = null;
  const sp = frames.map(f => {
    if (!f.j) return 0;
    const h = [0, 1, 2].map(c => (f.j.lwri[["x", "y", "z"][c]] + f.j.rwri[["x", "y", "z"][c]]) / 2);
    const s = last ? Math.hypot(h[0] - last.h[0], h[1] - last.h[1], h[2] - last.h[2]) / Math.max(f.t - last.t, 1e-6) : 0;
    last = { h, t: f.t };
    return s;
  });
  if (!sp.length) return null;
  let pk = 0; sp.forEach((v, i) => { if (v > sp[pk]) pk = i; });
  if (sp[pk] < MIN_PEAK_MPS) return null;
  const moving = sp.filter(v => v > 0).sort((a, b) => a - b), med = moving.length ? moving[Math.floor(moving.length / 2)] : 0;
  const hit = frames[pk].t, t0 = frames[0].t, t1 = frames[frames.length - 1].t;
  const start = Math.max(t0, hit - SWING_PRE_S), end = Math.min(t1, hit + SWING_POST_S);
  if (end - start < MIN_WINDOW_S) return null;
  const valid = frames.filter(f => f.j).length / frames.length, ratio = med > 0 ? sp[pk] / med : Infinity;
  return { start, end, release: hit, confidence: valid >= 0.9 && ratio > 6 ? "높음" : valid >= 0.7 && ratio > 3 ? "보통" : "낮음" };
}

/** 구간 막대를 움직일 때 길이를 최소~최대 안에 둔다: 시작은 끝-최소 이하, 끝은 시작+최소 이상, 길이는 최대 이하, 범위 안.
 *  (끝 너머로 끌어도 분석이 막히지 않게, 막대가 그 자리에서 멈추도록 한다) */
export function adjustClip(m, key, v, range, { min, max }) {
  const r1 = x => Math.round(x * 100) / 100;
  let { start, end } = m;
  if (key === "start") start = Math.min(Math.max(v, range.start, end - max), end - min);
  else end = Math.max(Math.min(v, range.end, start + max), start + min);
  return { start: r1(start), end: r1(end) };
}
