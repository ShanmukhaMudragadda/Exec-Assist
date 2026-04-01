import webpush from 'web-push';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function initWebPush(): void {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  console.log('[push] VAPID initialized');
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
  badge?: string;
}

export async function sendPushNotification(userId: string, payload: PushPayload): Promise<void> {
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (!subscriptions.length) return;

  const notification = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? '/',
    icon: payload.icon ?? '/icon-192.png',
    badge: payload.badge ?? '/icon-192.png',
    tag: payload.tag,
  });

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        notification
      )
    )
  );

  // Clean up expired/gone subscriptions (HTTP 410 or 404)
  const expiredEndpoints: string[] = [];
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const err = result.reason as { statusCode?: number };
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        expiredEndpoints.push(subscriptions[i].endpoint);
      } else {
        console.error('[push] send failed:', err);
      }
    }
  });

  if (expiredEndpoints.length) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: expiredEndpoints } },
    });
  }
}

export async function sendPushToAll(
  payload: PushPayload,
  options?: { onlyEnabled?: boolean }
): Promise<void> {
  const users = await prisma.user.findMany({
    where: options?.onlyEnabled
      ? { pushNotificationsEnabled: true, pushSubscriptions: { some: {} } }
      : { pushSubscriptions: { some: {} } },
    select: { id: true },
  });

  // Send in batches of 50 to avoid overwhelming the push service
  for (let i = 0; i < users.length; i += 50) {
    await Promise.allSettled(
      users.slice(i, i + 50).map((u) => sendPushNotification(u.id, payload))
    );
  }
}
