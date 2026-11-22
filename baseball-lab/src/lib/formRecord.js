/* 영상 분석 결과(투구 폼) 만들기: 따라간 프레임(월드 좌표) → 정렬 → 순간·특징·신뢰도 → 카드·구속 범위 → 저장할 기록.
 * 영상 픽셀은 담지 않는다. 3D 관절 좌표만 저장해 영상 없이도 스켈레톤을 다시 볼 수 있다. */
import { JOINTS, align, findEvents, features3d, confidence, boneCheck, BONE_CV_CAP, fixLeftRight } from "./form.js";
import { findEventsHit, featuresHit } from "./hit.js";
import { buildHitCards } from "./hitCards.js";
import { buildCards } from "./cards.js";
import { jointUse, sequence, angleSeries } from "./formUse.js";

export const MAX_RECORD_CHARS = 300_000;
const MIN_WRIST_MPS = 2.0;   // 던지는 손목 최고 속도가 이보다 느리면 투구가 아니다(segment.js와 같은 기준)
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;

/** 동작을 못 찾았거나 움직임이 너무 작으면 신뢰도를 "낮음"으로 내린다.
 *  앞발 착지는 투구에서만 필수다. 타격은 착지를 못 찾아도 착지 기준 지표만 비우고, 나머지로 신뢰도를 정하되 최대 "보통"으로 제한한다. */
export function finalConf(conf, { sport, events, wristMax, boneCv = null }) {
  if (events.br == null || wristMax < MIN_WRIST_MPS) return "낮음";
  if (conf === "높음" && boneCv != null && boneCv > BONE_CV_CAP) conf = "보통";   // 흔들림이 0.10을 넘으면 믿을 만한 지표가 줄기 시작한다(모의 실험)
  if (events.fp == null) return sport === "hitting" && conf === "높음" ? "보통" : sport === "hitting" ? conf : "낮음";
  return conf;
}

/** @param frames {t,j|null}[] 월드 좌표(정렬 전) @param opts {view, hand, heightCm, clip:{start,end}, ref(form_ref.json), model(form_model.json)|null} */
export function buildResult(rawFrames, { view, hand, heightCm = null, ref, model = null, sport = "pitching" }) {
  const hit = sport === "hitting";
  const frames = fixLeftRight(rawFrames);
  const aligned = align(frames, hand), ev = hit ? findEventsHit(aligned) : findEvents(aligned), bone = boneCheck(aligned);
  let conf = confidence(aligned, ev);
  if (!bone.ok) conf = "낮음";                                   // 뼈 길이가 흔들리면 3D 추정이 불안정한 영상
  const valid = aligned.filter(f => f.j), toValid = []; let c = 0; aligned.forEach(f => { toValid.push(f.j ? c++ : -1); });
  const vi = i => (i == null ? null : toValid[i] >= 0 ? toValid[i] : null);
  const events = { lift: vi(ev.lift), fp: vi(ev.fp), br: vi(ev.br) };
  const T = k => (events[k] == null ? null : valid[events[k]].t);
  const features = hit ? featuresHit(aligned) : features3d(aligned);
  const s = angleSeries(valid);
  conf = finalConf(conf, { sport, events, wristMax: Math.max(0, ...s.wrist), boneCv: bone.cv });   // 동작을 못 찾은 영상
  const { cards, message, speed } = hit ? buildHitCards({ features, view, ref, conf, model }) : buildCards({ features, view, hand, heightCm, ref, conf, model });
  const joints = f => JOINTS.flatMap(n => [r2(f.j[n].x), r2(f.j[n].y), r2(f.j[n].z)]);
  const pick = [[hit ? "앞발 들기" : "발 들기", T("lift")], ["앞발 착지", T("fp")], ["몸통 회전", T("fp") != null && T("br") != null ? (T("fp") + T("br")) / 2 : null], [hit ? "타격 순간" : "릴리스", T("br")]].filter(x => x[1] != null);
  const keyframes = pick.map(([label, t]) => { const f = valid.reduce((b, x) => (Math.abs(x.t - t) < Math.abs(b.t - t) ? x : b), valid[0]); return { label, t: r3(f.t), joints: Object.fromEntries(JOINTS.map(n => [n, [r3(f.j[n].x), r3(f.j[n].y), r3(f.j[n].z)]])) }; });
  const use = events.lift != null && events.br != null ? jointUse(valid, T("lift"), T("br"), sport) : [];
  const seq = events.fp != null && events.br != null ? sequence(valid, T("fp"), T("br"), sport) : { steps: [], ordered: null };
  return {
    kind: "form", sport, events: { ...events, t: { lift: T("lift"), fp: T("fp"), br: T("br") } },
    features: Object.fromEntries(Object.entries(features).map(([k, v]) => [k, v == null ? null : r3(v)])), conf, bone: { ok: bone.ok, cv: r3(bone.cv) },
    use: use.map(x => ({ ...x, min: r1(x.min), max: r1(x.max), range: r1(x.range), peakDps: Math.round(x.peakDps), peakMs: Math.round(x.peakMs) })), sequence: { ...seq, steps: seq.steps.map(x => ({ ...x, ms: Math.round(x.ms) })) },
    series: { t: s.t.map(r3), elbow: s.elbow.map(r1), kneeL: s.kneeL.map(r1), kneeR: s.kneeR.map(r1), shoulderYaw: s.shoulderYaw.map(r1), pelvisYaw: s.pelvisYaw.map(r1), lean: s.lean.map(r1) },
    keyframes, frames3d: valid.map(joints), cards, message, speed: speed ? { mph: r1(speed.mph), rmse: speed.rmse, model: speed.model ?? null } : null,
    refMeta: { n_trials: ref.meta.n_trials ?? ref.meta.n_swings, n_athletes: ref.meta.n_athletes, license: ref.meta.license, source: ref.meta.source, playing_levels: ref.meta.playing_levels, best_model: ref.meta.best[view], rmse: ref.meta.degrade?.[view] ?? ref.meta.models?.[view]?.[ref.meta.best[view]]?.rmse, top_tercile_cut_mph: ref.meta.top_tercile_cut_mph },
  };
}

/** 기록 크기(문자 수)가 한도를 넘으면 프레임을 절반씩 줄여 맞춘다 (핵심 순간 그림은 그대로) */
export function fitBudget(rec, limit = MAX_RECORD_CHARS) {
  let r = rec;
  while (JSON.stringify(r).length > limit && r.result.frames3d.length > 20) {
    const ev = r.result.events, keep = (_, i) => i % 2 === 0;
    const half = v => (typeof v === "number" ? Math.round(v / 2) : v);
    r = { ...r, result: { ...r.result, frames3d: r.result.frames3d.filter(keep), series: Object.fromEntries(Object.entries(r.result.series).map(([k, a]) => [k, a.filter(keep)])), events: { ...ev, lift: half(ev.lift), fp: half(ev.fp), br: half(ev.br) } } };
  }
  return r;
}

export function buildRecord({ id, now = new Date(), params, result, sport = "pitching" }) {
  const ymd = now.toISOString().slice(0, 10);
  return fitBudget({ id, createdAt: now.toISOString(), mode: "video", source: "mine", type: sport, season: null, title: `${sport === "hitting" ? "타격 자세" : "투구 폼"} 분석 ${ymd}`, params, result });
}
