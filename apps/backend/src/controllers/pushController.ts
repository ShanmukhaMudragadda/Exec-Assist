import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().optional(),
});

// GET /push/vapid-public-key — no auth required; browser needs this before subscribing
export const getVapidPublicKey = (_req: AuthRequest, res: Response) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ error: 'Push notifications not configured' });
  return res.json({ key });
};

// POST /push/subscribe
export const subscribe = async (req: AuthRequest, res: Response) => {
  try {
    const data = subscribeSchema.parse(req.body);
    const userId = req.user!.id;

    await prisma.pushSubscription.upsert({
      where: { endpoint: data.endpoint },
      update: {
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        userAgent: data.userAgent ?? null,
        userId, // re-associate if user changed on same browser
      },
      create: {
        userId,
        endpoint: data.endpoint,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        userAgent: data.userAgent ?? null,
      },
    });

    return res.status(201).json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error('[pushController] subscribe error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /push/unsubscribe
export const unsubscribe = async (req: AuthRequest, res: Response) => {
  try {
    const { endpoint } = req.body as { endpoint?: string };
    const userId = req.user!.id;

    if (endpoint) {
      // Remove specific subscription (this device only)
      await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
    } else {
      // Remove all subscriptions for this user (global disable)
      await prisma.pushSubscription.deleteMany({ where: { userId } });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[pushController] unsubscribe error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
