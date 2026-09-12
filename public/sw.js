// Service Worker（オフライン対応）
// キャッシュ名のバージョンと事前キャッシュ一覧は scripts/build-sw.mjs がビルド後に埋め込みます。
// ビルド成果物（assets/ 配下）はハッシュ付きファイル名なので、一覧をここに埋め込んで事前キャッシュします。
const CACHE_NAME = "jinkei-lab-__VERSION__";
const APP_SHELL = __PRECACHE__;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // 計測ビーコンなど別オリジンへの通信はキャッシュしない（SWは関与しない）
  if (url.origin !== self.location.origin) return;

  // ページ本体: ネット優先、オフライン時はキャッシュ済み index.html
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // それ以外（JS/CSS/画像）: キャッシュ優先、無ければ取得してキャッシュ
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return res;
        })
    )
  );
});
