// Minimal service worker so the app can be installed on phones.
// Network first; nothing is cached, so the board always shows live data.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
