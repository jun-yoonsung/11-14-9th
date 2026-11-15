/* 브라우저 저장소(막혀 있으면 이 페이지 안에서만 임시 사용), 체험·실제 로그인 표시, 분석 기록 */
import { cloud } from "./cloud.js";

const mem = {};
export const Safe = {
  get(k) { try { const v = localStorage.getItem(k); if (v !== null) return v; } catch (e) { /* 저장소가 막힌 경우 */ } return k in mem ? mem[k] : null; },
  set(k, v) { mem[k] = v; try { localStorage.setItem(k, v); } catch (e) { /* 무시 */ } },
  del(k) { delete mem[k]; try { localStorage.removeItem(k); } catch (e) { /* 무시 */ } },
  getJSON(k, fallback) { try { const v = this.get(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
  setJSON(k, v) { this.set(k, JSON.stringify(v)); },
};

// ---------- 로그인 표시 ----------
export const AUTH_KEY = "bl_auth";
export const Auth = {
  isIn() { const a = Safe.getJSON(AUTH_KEY, null); return !!(a && a.loggedIn === true); },
  name() { const a = Safe.getJSON(AUTH_KEY, null); return (a && a.name) || "체험 사용자"; },
  loginDemo() { Safe.setJSON(AUTH_KEY, { loggedIn: true, name: "체험 사용자" }); },
  set(user) { Safe.setJSON(AUTH_KEY, { loggedIn: true, name: user.name, uid: user.uid, cloud: true }); },
  clearCloud() { const a = Safe.getJSON(AUTH_KEY, null); if (a && a.cloud) Safe.del(AUTH_KEY); },
  logout() { Safe.del(AUTH_KEY); cloud.signOut(); },
  uid() { const a = Safe.getJSON(AUTH_KEY, null); return a && a.cloud ? a.uid : null; },
};

// ---------- 분석 기록 ----------
const KEY = "bl_history_kbo", WIZ = "bl_wizard_kbo";
export const Store = {
  KEY,
  list() { const l = Safe.getJSON(KEY, []); return Array.isArray(l) ? l : []; },
  add(rec) { const l = this.list(); l.push(rec); Safe.setJSON(KEY, l); cloud.saveRecord(rec, Auth.uid()); return rec; },
  get(id) { return this.list().find(r => r.id === id) || null; },
  remove(id) { Safe.setJSON(KEY, this.list().filter(r => r.id !== id)); cloud.deleteRecord(id, Auth.uid()); },
  newId() { return "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
  wizard() { return Safe.getJSON(WIZ, {}) || {}; },
  saveWizard(w) { Safe.setJSON(WIZ, w); },
  clearWizard() { Safe.del(WIZ); },
  // 다른 기기에서 만든 기록을 가져와 합친다. 바뀐 게 있으면 true
  async pull() {
    const uid = Auth.uid(); if (!uid) return false;
    const remote = await cloud.pullRecords(uid); if (!remote) return false;
    const local = this.list(), have = new Set(local.map(r => r.id)); let changed = false;
    remote.records.forEach(r => { if (!have.has(r.id)) { local.push(r); changed = true; } });
    local.filter(r => !remote.ids.has(r.id)).forEach(r => cloud.saveRecord(r, uid));   // 이 브라우저에만 있던 기록은 올린다
    if (changed) Safe.setJSON(KEY, local);
    return changed;
  },
};
