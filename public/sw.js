/*
  Service worker.

  Deliberately minimal: this app's data is personal and time-sensitive, so
  caching API responses would risk showing a student yesterday's deadlines as
  though they were current. Only the static shell is cached, and every /api/
  request goes straight to the network.

  Its other job is push — a service worker is the only context that can receive
  a push event and show a notification while the app is closed.
*/

const CACHE = "scholar-shell-v1";
const SHELL = ["/icon-192.png", "/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never serve app data from cache — stale homework is worse than no homework.
  if (url.pathname.startsWith("/api/") || event.request.method !== "GET") return;

  if (SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request)));
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Varaxis Scholar", body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Varaxis Scholar", {
      body: payload.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: payload.tag || "scholar",
      // Replace rather than stack: three notifications about the same
      // overloaded Thursday is how a student learns to swipe them all away.
      renotify: Boolean(payload.tag),
      data: { url: payload.url || "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(target) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
