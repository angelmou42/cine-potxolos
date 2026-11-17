// Cine Potxolos service worker: the page always tries the network first (so updates arrive at once),
// posters and icons come from cache. Firebase and Letterboxd (other origins) are never touched.
const CACHE = "potxolos-v2";
const SHELL = ["./", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  const isPage = req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith(".html");
  if (isPage) {
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put("./", copy)); return res; })
      .catch(() => caches.match("./")));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});

// Push notices (sent by sync/notify.mjs when the other one rates or reviews something)
self.addEventListener("push", e => {
  let m = {}; try { m = e.data ? e.data.json() : {}; } catch (_) { m = { title: "Cine Potxolos", body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(m.title || "Cine Potxolos", {
    body: m.body || "", tag: m.tag, renotify: !!m.tag, icon: "icons/icon-192.png", badge: "icons/badge-96.png", lang: "es",
    data: { url: new URL(m.url || "./", self.registration.scope).href },
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = e.notification.data && e.notification.data.url || self.registration.scope;
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const win = list.find(c => c.url.startsWith(self.registration.scope));
    return win ? win.navigate(url).then(c => (c || win).focus()) : clients.openWindow(url);
  }));
});
