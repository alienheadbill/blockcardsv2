/* Kitchen Blockcards service worker — caches the app shell only.
 * App data lives in the page (demo mode) and is never cached here. */
const CACHE = "blockcards-shell-v3";
// Works at the site root or under a sub-path (GitHub Pages: /blockcardsv2/).
const SCOPE = self.registration.scope;

self.addEventListener("install", (event) => {
  // The static build ships precache.json listing every page and asset, so any screen
  // opens offline after the first visit — not just the ones already visited.
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (c) => {
        await c.addAll([SCOPE, `${SCOPE}icon.svg`, `${SCOPE}manifest.webmanifest`]);
        try {
          const res = await fetch(`${SCOPE}precache.json`, { cache: "no-store" });
          if (res.ok) {
            const list = await res.json();
            await Promise.allSettled(list.map((p) => c.add(SCOPE + p)));
          }
        } catch {
          /* server build has no precache list */
        }
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  // Network first, falling back to cache so the app opens with flaky kitchen Wi-Fi.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (req.mode === "navigate" || /\/_next\/static\//.test(req.url))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match(SCOPE))),
  );
});
