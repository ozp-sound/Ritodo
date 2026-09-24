// No private pages or account data are cached. Push can display without a page or sign-in fetch.
self.addEventListener("push", event => {
  let data;
  try { data = event.data?.json(); } catch { data = null; }
  event.waitUntil(self.registration.showNotification(data?.title || "Ritodo", {
    body: data?.body || "你有一条新的日程提醒。", tag: data?.tag || "ritodo",
    icon: "/icon-192.png", badge: "/icon-192.png", data: { url: "/" },
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) if (new URL(client.url).origin === self.location.origin) return client.focus();
    return self.clients.openWindow("/");
  })());
});
