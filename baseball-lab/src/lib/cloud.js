/* Firebase 연결: 로그인(이메일·Google)과 Firestore(분석 기록, KBO CSV).
   src/config.js의 firebase가 비어 있으면 아무것도 하지 않고, 사이트는 체험 로그인 + public/data CSV로 그대로 동작한다.
   firebase 패키지는 켜졌을 때만 불러온다(코드 분할). */
import { CONFIG } from "../config.js";

export const cloudEnabled = !!(CONFIG.firebase && CONFIG.firebase.apiKey);
let pm = null;
function sdk() {
  if (!pm) {
    pm = Promise.all([import("firebase/app"), import("firebase/auth"), import("firebase/firestore")]).then(([a, au, fs]) => {
      const app = a.initializeApp(CONFIG.firebase);
      return { au, fs, auth: au.getAuth(app), db: fs.getFirestore(app) };
    });
  }
  return pm;
}

export const errMsg = e => ({
  "auth/invalid-email": "이메일 형식이 맞지 않습니다.",
  "auth/missing-password": "비밀번호를 입력해 주세요.",
  "auth/weak-password": "비밀번호는 6자 이상이어야 합니다.",
  "auth/email-already-in-use": "이미 가입된 이메일입니다. 로그인해 주세요.",
  "auth/invalid-credential": "이메일 또는 비밀번호가 맞지 않습니다.",
  "auth/user-not-found": "이메일 또는 비밀번호가 맞지 않습니다.",
  "auth/wrong-password": "이메일 또는 비밀번호가 맞지 않습니다.",
  "auth/too-many-requests": "시도가 너무 많습니다. 잠시 뒤 다시 해 주세요.",
  "auth/popup-closed-by-user": "로그인 창이 닫혔습니다.",
  "auth/network-request-failed": "인터넷 연결을 확인해 주세요.",
}[(e && e.code) || ""] || "처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");

const toUser = u => ({ uid: u.uid, name: u.displayName || (u.email || "").split("@")[0] || "회원" });

export const cloud = {
  enabled: cloudEnabled,
  // 로그인 상태가 바뀔 때마다 알려 준다 (user는 {uid, name} 또는 null). 해제 함수를 돌려 준다.
  async watch(cb) {
    if (!cloudEnabled) return () => {};
    try { const { au, auth } = await sdk(); return au.onAuthStateChanged(auth, u => cb(u ? toUser(u) : null)); } catch (e) { return () => {}; }
  },
  async signUp(email, pw, nick) {
    const { au, auth } = await sdk();
    const c = await au.createUserWithEmailAndPassword(auth, email, pw);
    if (nick) await au.updateProfile(c.user, { displayName: nick });
    return { uid: c.user.uid, name: nick || toUser(c.user).name };
  },
  async signIn(email, pw) { const { au, auth } = await sdk(); return toUser((await au.signInWithEmailAndPassword(auth, email, pw)).user); },
  async google() { const { au, auth } = await sdk(); return toUser((await au.signInWithPopup(auth, new au.GoogleAuthProvider())).user); },
  async signOut() { if (!cloudEnabled) return; try { const { au, auth } = await sdk(); await au.signOut(auth); } catch (e) { /* 무시 */ } },

  // 분석 기록: users/{uid}/records/{id} (본인만 읽고 씀)
  async saveRecord(rec, uid) {
    if (!cloudEnabled || !uid) return;
    try { const { fs, db } = await sdk(); await fs.setDoc(fs.doc(db, "users", uid, "records", rec.id), { json: JSON.stringify(rec), createdAt: rec.createdAt }); } catch (e) { /* 무시 */ }
  },
  async deleteRecord(id, uid) {
    if (!cloudEnabled || !uid) return;
    try { const { fs, db } = await sdk(); await fs.deleteDoc(fs.doc(db, "users", uid, "records", id)); } catch (e) { /* 무시 */ }
  },
  async pullRecords(uid) {
    if (!cloudEnabled) return null;
    try {
      const { fs, db } = await sdk();
      const snap = await fs.getDocs(fs.collection(db, "users", uid, "records"));
      const records = [], ids = new Set();
      snap.forEach(d => { ids.add(d.id); try { records.push(JSON.parse(d.data().json)); } catch (e) { /* 깨진 기록은 건너뜀 */ } });
      return { records, ids };
    } catch (e) { return null; }
  },

  // KBO 데이터: datasets/{이름}/chunks/{번호} 의 CSV 텍스트 조각 (모두 공개 읽기)
  async readCsvText(name) {
    const { fs, db } = await sdk();
    const snap = await fs.getDocs(fs.collection(db, "datasets", name, "chunks"));
    const parts = []; snap.forEach(d => parts.push([Number(d.id), d.data().csv]));
    if (!parts.length) throw new Error("empty " + name);
    return parts.sort((a, b) => a[0] - b[0]).map(p => p[1]).join("\n");
  },
  async readMeta() {
    const { fs, db } = await sdk(); const d = await fs.getDoc(fs.doc(db, "datasets", "meta"));
    if (!d.exists()) throw new Error("no meta"); return JSON.parse(d.data().json);
  },
};
