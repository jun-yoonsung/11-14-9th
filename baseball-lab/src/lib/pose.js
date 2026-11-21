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
/** 10분(600초)이 넘거나 길이를 알 수 없으면 먼저 구간을 잘라야 한다 */
export const needsTrim = duration => !(duration <= MAX_UNTRIMMED_SEC);

/** 화면 좌표(0~1) 12관절 — 사람 고르기·미리보기용 */
export function toScreen(landmarks) {
  return Object.fromEntries(JOINTS.map(n => { const p = landmarks[MP_INDEX[n]]; return [n, { x: p.x, y: p.y, v: p.visibility ?? 1 }]; }));
}

const isSlow = () => typeof navigator !== "undefined" && (navigator.hardwareConcurrency || 8) <= 4;

/** 관절 추적기. GPU가 안 되면 CPU로 다시 시도하고, 느린 기기로 보이면 가벼운(lite) 모델을 쓴다. */
export async function loadLandmarker(opts = {}) {
  const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(`${BASE}wasm`);
  const lite = opts.lite ?? isSlow();
  const modelAssetPath = `${BASE}models/pose_landmarker_${lite ? "lite" : "full"}.task`;
  const make = delegate => PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath, delegate }, runningMode: "VIDEO", numPoses: 3 });
  let lm, delegate = "GPU";
  try { lm = await make("GPU"); } catch { delegate = "CPU"; lm = await make("CPU"); }
  return { lm, lite, delegate, ts: 0 };
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
