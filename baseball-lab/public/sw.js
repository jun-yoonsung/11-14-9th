/* 서비스 워커: 네트워크 우선으로 받아 오고, 오프라인일 때는 마지막으로 받은 파일을 쓴다 (화면 파일 이름이 빌드마다 바뀌므로 목록 대신 실행 중 저장) */
const CACHE = "bl-react-v2";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req).then(r => r || caches.match("./")))
  );
});
