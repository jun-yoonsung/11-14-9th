/* 오프라인에서도 열리도록 화면 파일과 샘플 데이터를 저장해 둔다 */
const CACHE = "bl-v6";
const FILES = ["./", "index.html", "login.html", "signup.html", "analyze.html", "history.html", "result.html", "rank.html", "guide.html",
  "css/style.css", "js/core.js", "js/stats.js", "js/view.js", "js/detail.js", "js/report.js", "js/analyze.js", "js/result.js", "js/history.js", "js/index.js", "js/login.js", "js/signup.js", "js/rank.js", "js/guide.js", "js/config.js", "js/cloud.js", "js/scene.js",
  "manifest.webmanifest", "icons/icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// (data 폴더의 CSV는 용량이 커서 미리 저장하지 않고, 한 번 열면 그때 저장한다)
// 같은 사이트 파일: 네트워크 우선, 실패하면 저장본 (수정이 바로 반영되도록)
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); return res; }).catch(() => caches.match(r, { ignoreSearch: true })));
});
