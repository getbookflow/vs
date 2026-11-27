const CACHE = "vs-v29";

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

// Notifications reçues quand VS est fermé ou en arrière-plan
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch (_) { d = { title: "VS", body: e.data ? e.data.text() : "" }; }
  e.waitUntil((async () => {
    const ios = /iPhone|iPad|iPod/i.test(self.navigator.userAgent);
    const ouverts = await clients.matchAll({ type: "window", includeUncontrolled: true });
    // Si VS est déjà ouvert à l'écran, l'appli prévient elle-même (sauf iPhone et test)
    if (!ios && !d.force && ouverts.some((c) => c.visibilityState === "visible")) return;
    await self.registration.showNotification(d.title || "VS", {
      body: d.body || "",
      icon: "icon-192.png",
      badge: "icon-192.png",
      tag: d.appel ? "appel" : undefined,
      renotify: !!d.appel,
      requireInteraction: !!d.appel,
      vibrate: d.appel ? [300, 150, 300, 150, 300, 150, 300] : [100, 50, 100],
      data: { url: d.url || "./" },
    });
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((liste) => {
      if (liste.length) return liste[0].focus();
      return clients.openWindow((e.notification.data && e.notification.data.url) || "./");
    })
  );
});
