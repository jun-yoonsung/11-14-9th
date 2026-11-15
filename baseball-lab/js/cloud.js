/* 클라우드 연결: Firebase 로그인(이메일·Google)과 Firestore(분석 기록 저장, KBO CSV 읽기).
   js/config.js의 firebase가 비어 있으면 아무것도 하지 않고, 사이트는 체험 로그인 + data/ 폴더 CSV로 그대로 동작한다. */
(function () {
  "use strict";
  const CFG = window.BL_CONFIG || {};
  const V = "10.12.2";
  const base = "https://www.gstatic.com/firebasejs/" + V + "/";
  const enabled = !!(CFG.firebase && CFG.firebase.apiKey);
  let pm = null;   // SDK 준비 약속

  function sdk() {
    if (!pm) {
      pm = Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]).then(([a, au, fs]) => {
        const app = a.initializeApp(CFG.firebase);
        return { au, fs, auth: au.getAuth(app), db: fs.getFirestore(app) };
      });
    }
    return pm;
  }

  const msg = e => {
    const c = (e && e.code) || "";
    return ({
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
    })[c] || "처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
  };

  function remember(user) {
    if (user) BL.Safe.setJSON(BL.Auth.KEY, { loggedIn: true, name: user.displayName || (user.email || "").split("@")[0] || "회원", uid: user.uid, cloud: true });
    else { const a = BL.Safe.getJSON(BL.Auth.KEY, null); if (a && a.cloud) BL.Safe.del(BL.Auth.KEY); }
  }

  const Cloud = {
    enabled,
    msg,
    // 앱을 열 때 한 번: 로그인 상태를 맞추고, 로그아웃돼 있으면 보호 화면에서 내보낸다
    async init() {
      if (!enabled) return;
      try {
        const { au, auth } = await sdk();
        au.onAuthStateChanged(auth, user => {
          const was = BL.Auth.isIn();
          remember(user);
          if (!user && was && document.body.dataset.protected === "1") BL.Auth.require();
        });
      } catch (e) { /* 인터넷이 없으면 저장된 로그인 표시를 그대로 쓴다 */ }
    },
    async signUp(email, pw, nick) {
      const { au, auth } = await sdk();
      const c = await au.createUserWithEmailAndPassword(auth, email, pw);
      if (nick) await au.updateProfile(c.user, { displayName: nick });
      remember(Object.assign({}, c.user, { displayName: nick || c.user.displayName, uid: c.user.uid, email: c.user.email }));
    },
    async signIn(email, pw) { const { au, auth } = await sdk(); const c = await au.signInWithEmailAndPassword(auth, email, pw); remember(c.user); },
    async google() { const { au, auth } = await sdk(); const c = await au.signInWithPopup(auth, new au.GoogleAuthProvider()); remember(c.user); },
    async signOut() { if (!enabled) return; try { const { au, auth } = await sdk(); await au.signOut(auth); } catch (e) {} },

    // ---------- 분석 기록 (users/{uid}/records/{id}, 본인만 읽고 쓰는 규칙) ----------
    uid() { const a = BL.Safe.getJSON(BL.Auth.KEY, null); return a && a.cloud ? a.uid : null; },
    async saveRecord(rec) {
      const uid = this.uid(); if (!uid) return;
      try { const { fs, db } = await sdk(); await fs.setDoc(fs.doc(db, "users", uid, "records", rec.id), { json: JSON.stringify(rec), createdAt: rec.createdAt }); } catch (e) {}
    },
    async deleteRecord(id) {
      const uid = this.uid(); if (!uid) return;
      try { const { fs, db } = await sdk(); await fs.deleteDoc(fs.doc(db, "users", uid, "records", id)); } catch (e) {}
    },
    // 내 기록을 내려받아 이 브라우저 기록과 합친다 (같은 id는 클라우드 쪽을 우선). 바뀐 게 있으면 true
    async pullRecords() {
      const uid = this.uid(); if (!uid) return false;
      try {
        const { fs, db } = await sdk();
        const snap = await fs.getDocs(fs.collection(db, "users", uid, "records"));
        const local = BL.Store.list(), have = new Set(local.map(r => r.id)); let changed = false;
        snap.forEach(d => { try { const r = JSON.parse(d.data().json); if (!have.has(r.id)) { local.push(r); changed = true; } } catch (e) {} });
        // 이 브라우저에만 있는 기록은 클라우드로 올린다
        const cloud = new Set(); snap.forEach(d => cloud.add(d.id));
        local.filter(r => !cloud.has(r.id)).forEach(r => this.saveRecord(r));
        if (changed) BL.Safe.setJSON(BL.Store.KEY, local);
        return changed;
      } catch (e) { return false; }
    },

    // ---------- KBO 데이터 (datasets/{이름}/chunks/{번호}.csv 텍스트 조각, 모두 공개 읽기) ----------
    async readCsvText(name) {
      const { fs, db } = await sdk();
      const snap = await fs.getDocs(fs.collection(db, "datasets", name, "chunks"));
      const parts = []; snap.forEach(d => parts.push([Number(d.id), d.data().csv]));
      if (!parts.length) throw new Error("empty " + name);
      parts.sort((a, b) => a[0] - b[0]);
      return parts.map(p => p[1]).join("\n");
    },
    async readMeta() {
      const { fs, db } = await sdk(); const d = await fs.getDoc(fs.doc(db, "datasets", "meta"));
      if (!d.exists()) throw new Error("no meta"); return JSON.parse(d.data().json);
    },
  };
  window.BL.Cloud = Cloud;
  Cloud.init();
})();
