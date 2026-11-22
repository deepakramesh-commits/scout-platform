// Lets the match sheet open on a phone with no connection. Registered only by the sheet page.
// Network first, so a connected phone always gets the current page; the cache answers only when the network fails.
const CACHE = "scout-sheet-v1";
const isSheet = (url) => /^\/matches\/[^/]+\/sheet\/?$/.test(new URL(url).pathname);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// The page sends what it loaded before this worker took control, so the first visit is enough to work offline.
self.addEventListener("message", (event) => {
  const urls = Array.isArray(event.data?.cache) ? event.data.cache : [];
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(urls.map((u) => cache.add(u).catch(() => undefined)))));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  const forSheet = req.mode === "navigate" ? isSheet(req.url) : Boolean(req.referrer) && isSheet(req.referrer);
  if (!forSheet) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit ?? Response.error())),
  );
});
