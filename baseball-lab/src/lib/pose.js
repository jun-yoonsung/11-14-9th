/* 브라우저 관절 추적 (MediaPipe Pose Landmarker). 영상은 서버로 보내지 않고 이 브라우저 안에서만 처리한다.
 * 영상 파일은 통째로 읽지 않고 object URL로 재생기에 연결해, 필요한 시각만 건너뛰며(seek) 프레임을 읽는다. */
import { JOINTS, MP_INDEX, toFrame } from "./form.js";

export const MAX_UNTRIMMED_SEC = 600;
const BASE = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL) || "/";

/** from..to를 1/fps 간격으로 나눈 시각들 (끝 시각은 항상 포함) */
export function frameTimes(from, to, fps) {
  if (to < from) return [];
  const out = [], dt = 1 / fps;
  for (let k = 0; from + k * dt < to - 1e-9; k++) out.push(from + k * dt);
  out.push(to);
  return out;
}
const COMMON_FPS = [24, 25, 30, 48, 50, 60, 90, 100, 120, 240];
/** 프레임 간격(초) 목록의 중앙값을 흔한 프레임 속도로 맞춘다. 쓸 수 있는 값이 없으면 null */
export function nativeFps(dts) {
  const d = dts.filter(x => x > 0 && isFinite(x)).sort((a, b) => a - b);
  if (!d.length) return null;
  const f = 1 / d[Math.floor(d.length / 2)];
  return COMMON_FPS.reduce((best, c) => (Math.abs(c - f) < Math.abs(best - f) ? c : best));
}
/** 분석 프레임 속도: 영상이 50fps 이상이면 60, 아니면 30. 모의 실험에서 60fps는 믿을 만한 지표가 12개 중 8→10개, 시간 지표가 특히 좋아졌다 */
export const fineFps = native => (native != null && native >= 50 ? 60 : 30);
/** 재생기로 잠깐 재생하며 프레임 간격을 재서 영상의 프레임 속도를 알아낸다(못 알아내면 null) */
export async function detectFps(video) {
  if (!("requestVideoFrameCallback" in video)) return null;
  const t0 = video.currentTime, dts = []; let last = null;
  const done = new Promise(res => {
    const timer = setTimeout(res, 2500);
    const cb = (_now, meta) => {
      if (last != null && meta.mediaTime > last) dts.push(meta.mediaTime - last);
      last = meta.mediaTime;
      if (dts.length >= 12) { clearTimeout(timer); res(); } else video.requestVideoFrameCallback(cb);
    };
    video.requestVideoFrameCallback(cb);
  });
  try { await video.play(); await done; } catch { /* 재생 불가: 30fps로 */ }
  video.pause(); video.currentTime = t0;
  return nativeFps(dts);
}

/** 10분(600초)이 넘거나 길이를 알 수 없으면 먼저 구간을 잘라야 한다 */
export const needsTrim = duration => !(duration <= MAX_UNTRIMMED_SEC);

/** 화면 좌표(0~1) 12관절 — 사람 고르기·미리보기용 */
export function toScreen(landmarks) {
  return Object.fromEntries(JOINTS.map(n => { const p = landmarks[MP_INDEX[n]]; return [n, { x: p.x, y: p.y, v: p.visibility ?? 1 }]; }));
}

/** 관절 추적기. 가장 정확한 heavy 모델을 쓴다(느려도 정확도 우선). GPU가 안 되면 CPU로 다시 시도하고,
 *  모델 파일을 못 읽으면 full → lite 순으로 물러난다. 비교용으로 주소에 ?pose=full|lite|heavy를 주면 그 모델을 쓴다. */
export async function loadLandmarker(opts = {}) {
  const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(`${BASE}wasm`);
  const asked = opts.model || (typeof location !== "undefined" ? new URLSearchParams((location.hash.split("?")[1] || "")).get("pose") : null);
  const order = ["heavy", "full", "lite"], first = order.includes(asked) ? asked : "heavy";
  const tries = [first, ...order.filter(m => m !== first)];
  let lm, delegate = "GPU", model = null, lastErr;
  for (const m of tries) {
    const make = d => PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: `${BASE}models/pose_landmarker_${m}.task`, delegate: d }, runningMode: "VIDEO", numPoses: 3 });
    try { lm = await make("GPU"); delegate = "GPU"; } catch (e) { try { lm = await make("CPU"); delegate = "CPU"; } catch (e2) { lastErr = e2; continue; } }
    model = m; break;
  }
  if (!lm) throw lastErr;
  return { lm, model, lite: model === "lite", delegate, ts: 0 };
}

/** 영상 파일 열기. 이 브라우저가 재생하지 못하는 코덱(예: HEVC)이면 Error("UNPLAYABLE") */
export async function openVideo(file) {
  const url = URL.createObjectURL(file), video = document.createElement("video");
  video.muted = true; video.playsInline = true; video.preload = "auto"; video.src = url;
  const close = () => { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); };
  try {
    await new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error("UNPLAYABLE")), 15000);
      video.onloadeddata = () => { clearTimeout(timer); res(); };
      video.onerror = () => { clearTimeout(timer); rej(new Error("UNPLAYABLE")); };
    });
    if (!video.videoWidth || !video.videoHeight) throw new Error("UNPLAYABLE");
  } catch (e) { close(); throw e; }
  return { video, duration: video.duration, url, close };
}

const seek = (video, t) => new Promise(res => {
  if (Math.abs(video.currentTime - t) < 1e-3) return res();
  const timer = setTimeout(res, 4000);
  video.addEventListener("seeked", () => { clearTimeout(timer); res(); }, { once: true });
  video.currentTime = t;
});
const yieldToUi = () => new Promise(r => setTimeout(r, 0));

/** 구간을 fps 간격으로 훑는다. 월드 좌표 프레임 {t, j, img, all}; all은 찾은 모든 사람 [{j, img}].
 *  취소(signal)하면 지금까지의 프레임을 돌려준다. 프레임마다 화면에 양보해 탭이 멈추지 않는다. */
export async function scan(landmarker, video, { from, to, fps, signal, onProgress } = {}) {
  const times = frameTimes(from, to, fps), frames = [];
  for (let i = 0; i < times.length; i++) {
    if (signal?.aborted) break;
    await seek(video, times[i]);
    landmarker.ts += 1000 / fps + 1;
    const res = landmarker.lm.detectForVideo(video, landmarker.ts);
    const all = (res.worldLandmarks || []).map((w, k) => ({ j: toFrame(times[i], w).j, img: toScreen(res.landmarks[k]) }));
    frames.push({ t: times[i], j: all[0]?.j ?? null, img: all[0]?.img ?? null, all });
    onProgress?.((i + 1) / times.length);
    await yieldToUi();
  }
  return frames;
}
