/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

declare const self: ServiceWorkerGlobalScope

// ── Workbox precache (manifest injected by vite-plugin-pwa; empty in dev) ───
clientsClaim()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
precacheAndRoute((self as any).__WB_MANIFEST ?? [])
cleanupOutdatedCaches()

// ── Runtime cache: Google Fonts ──────────────────────────────────────────────
registerRoute(
  ({ url }: { url: URL }) => url.origin === 'https://fonts.googleapis.com',
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
)

// ── Push event → show notification ──────────────────────────────────────────
self.addEventListener('push', (event: PushEvent) => {
  let data: { title: string; body: string; url?: string; icon?: string; badge?: string; tag?: string }

  try {
    data = event.data ? event.data.json() : { title: 'ExecAssist', body: 'You have a new notification' }
  } catch {
    data = { title: 'ExecAssist', body: event.data?.text() ?? 'You have a new notification' }
  }

  const notifOptions: NotificationOptions & { vibrate?: number[] } = {
    body: data.body,
    icon: data.icon ?? '/icon-192.png',
    badge: data.badge ?? '/icon-192.png',
    tag: data.tag,
    data: { url: data.url ?? '/' },
    vibrate: [100, 50, 100],
  }

  event.waitUntil(
    self.registration.showNotification(data.title, notifOptions).catch((err) => {
      console.error('[SW] showNotification failed:', err)
    })
  )
})

// ── Notification click → navigate or open app ────────────────────────────────
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const url: string = (event.notification.data as { url?: string })?.url ?? '/'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ('focus' in client) {
            ;(client as WindowClient).postMessage({ type: 'NAVIGATE', url })
            return client.focus()
          }
        }
        return self.clients.openWindow(url)
      })
  )
})

// ── Handle browser-rotated subscriptions (Firefox) ──────────────────────────
self.addEventListener('pushsubscriptionchange', (event: ExtendableEvent) => {
  const e = event as PushSubscriptionChangeEvent
  event.waitUntil(
    self.registration.pushManager
      .subscribe(
        e.oldSubscription?.options ?? {
          userVisibleOnly: true,
          applicationServerKey: e.oldSubscription?.options?.applicationServerKey,
        }
      )
      .then((newSub) => {
        self.clients
          .matchAll({ type: 'window' })
          .then((clients) =>
            clients.forEach((c) =>
              c.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED', subscription: JSON.stringify(newSub) })
            )
          )
      })
  )
})
