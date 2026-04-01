// Push notification handler — injected into the Workbox-generated service worker

self.addEventListener('push', function (event) {
  console.log('[SW] push event received', event.data ? 'with payload' : '(no payload)');

  var data = { title: 'ExecAssist', body: 'You have a new notification', url: '/', icon: '/icon-192.png', tag: undefined };
  try {
    if (event.data) {
      var parsed = event.data.json();
      data = Object.assign(data, parsed);
    }
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration
      .showNotification(data.title, {
        body: data.body,
        icon: data.icon || '/icon-192.png',
        badge: '/icon-192.png',
        tag: data.tag,
        vibrate: [100, 50, 100],
        data: { url: data.url || '/' },
      })
      .catch(function (err) {
        console.error('[SW] showNotification failed:', err);
      })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var client = list[i];
        if ('focus' in client) {
          client.postMessage({ type: 'NAVIGATE', url: url });
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

// Handle browser-rotated subscriptions (Firefox)
self.addEventListener('pushsubscriptionchange', function (event) {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(
        event.oldSubscription
          ? event.oldSubscription.options
          : { userVisibleOnly: true }
      )
      .then(function (newSub) {
        return self.clients.matchAll({ type: 'window' }).then(function (clients) {
          clients.forEach(function (client) {
            client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED', subscription: JSON.stringify(newSub) });
          });
        });
      })
      .catch(function (err) {
        console.error('[SW] pushsubscriptionchange re-subscribe failed:', err);
      })
  );
});
