// Never cache authenticated requests or user data. Offline data is device-local only.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("shared-todo-"))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    /* Show a safe generic notification. */
  }
  const bodies = [
    "Je dagbrief staat klaar. Begin met één kleine stap.",
    "Er staat een herinnering voor je klaar.",
    "Er is iets veranderd in je taken. Open Todo voor de details.",
  ];
  let body = bodies.includes(data.body)
    ? data.body
    : "Open Todo voor je overzicht.";
  if (Array.isArray(data.weather))
    for (const w of data.weather.slice(0, 2)) {
      if (
        w &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(w.time) &&
        Number.isFinite(w.temperature) &&
        w.temperature >= -90 &&
        w.temperature <= 65 &&
        Number.isFinite(w.rain) &&
        w.rain >= 0 &&
        w.rain <= 100 &&
        Number.isFinite(w.wind) &&
        w.wind >= 0 &&
        w.wind <= 400
      )
        body += ` Rond ${w.time}: ${Math.round(w.temperature)} °C, regenkans ${Math.round(w.rain)}%, wind ${Math.round(w.wind)} km/u.`;
    }
  event.waitUntil(
    self.registration.showNotification("Todo", {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: typeof data.tag === "string" ? data.tag.slice(0, 200) : "todo",
      data: { url: "/" },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clients) => {
        const same = clients.find(
          (c) => new URL(c.url).origin === self.location.origin,
        );
        if (same) {
          await same.focus();
          return;
        }
        await self.clients.openWindow("/");
      }),
  );
});
