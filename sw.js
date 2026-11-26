const CACHE = "vs-v27";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./index.html"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => clients.claim())
  );
});

// Toujours vérifier la dernière version des fichiers de VS (fini les anciennes versions bloquées)
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const local = new URL(e.request.url).origin === self.location.origin;
  const requete = local ? new Request(e.request, { cache: "no-cache" }) : e.request;
  e.respondWith(
    fetch(requete)
      .then((r) => {
        if (local && r.ok && e.request.mode === "navigate") {
          const copie = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copie));
        }
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
