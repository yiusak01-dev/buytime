// 啱啱好 service worker：只負責推送通知（唔做離線快取）
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || '啱啱好';
  const url = data.url || '/';
  event.waitUntil(
    (async () => {
      // 用家正望住 app：app 入面會自己彈提示，唔使再彈系統通知
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (wins.some((w) => w.visibilityState === 'visible' && w.focused)) return;
      await self.registration.showNotification(title, {
        body: data.body || '',
        icon: '/icon-192.png',
        badge: '/badge-96.png',
        data: { url },
        tag: data.tag || undefined,
        renotify: !!data.tag,
        vibrate: [200, 100, 200],
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of wins) {
        if (new URL(w.url).origin !== self.location.origin) continue;
        await w.focus();
        if ('navigate' in w) {
          try {
            await w.navigate(url);
          } catch {
            /* 舊瀏覽器唔支援就算 */
          }
        }
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
