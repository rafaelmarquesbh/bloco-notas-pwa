const CACHE_NAME = "notas-v16";
const APP_ASSETS = ["./", "./index.html", "./style.css", "./app.js", "./config.js", "./manifest.json", "./favicon.svg"];
const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(async (cache) => {
    await cache.addAll(APP_ASSETS);
    try { await cache.add(SUPABASE_JS); } catch (e) { console.warn("Não foi possível cachear Supabase JS", e); }
  }));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin === location.origin || url.href === SUPABASE_JS) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
      return response;
    })));
  }
});
