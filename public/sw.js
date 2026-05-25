self.addEventListener("install", () => {
  console.log("Service Worker installed");
  self.skipWaiting();
});

self.addEventListener("activate", () => {
  console.log("Service Worker active");
  self.clients.claim();
});

self.addEventListener("fetch", () => {});

// 🧠 prevent duplicate notifications per session
let lastNotificationTime = 0;

// 🔔 RECEIVE ALERTS FROM YOUR APP
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data) return;

  if (data.type === "TURN_ALERT") {

    const now = Date.now();

    // ⛔ throttle (avoid spam if multiple triggers come fast)
    if (now - lastNotificationTime < 5000) return;

    lastNotificationTime = now;

    self.registration.showNotification("🎮 WIN9JA", {
      body: data.body || "It is your turn",
      icon: "/icon192.png",
      badge: "/icon192.png",
      requireInteraction: true,
      silent: false
    });
  }
});