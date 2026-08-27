self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); }
  catch { data = { title: '買時間', body: event.data.text() }; }
  const {
    title = '買時間',
    body = '你有新訊息',
    url = '/chats',
    icon = '/favicon.ico',
  } = data;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: icon,
      data: { url },
      vibrate: [200, 100, 200],
      tag: data.chat_id ?? 'chat',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/chats';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes('/chat'));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
