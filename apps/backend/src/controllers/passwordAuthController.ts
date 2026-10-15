import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { logAudit } from '../services/auditService';
import { sendPasswordResetEmail } from '../services/emailService';
import {
  buildAuthResponse,
  canUsePassword,
  hashToken,
  isStaffEmail,
  issuePasswordLink,
  normalizeEmail,
} from '../services/externalAuthService';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

// Compared against when the account doesn't exist, so response time doesn't reveal which emails are registered
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_ROUNDS);

const INVALID_CREDENTIALS = 'Invalid email or password';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

const passwordSchema = z.string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters');

const setPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
  name: z.string().trim().min(2).max(100).optional(),
});

async function findUserByEmail(email: string) {
  return prisma.user.findFirst({ where: { email: { equals: normalizeEmail(email), mode: 'insensitive' } } });
}

async function findUserByToken(token: string) {
  const user = await prisma.user.findUnique({ where: { passwordTokenHash: hashToken(token) } });
  if (!user || !user.passwordTokenExpiry || user.passwordTokenExpiry < new Date() || !canUsePassword(user)) return null;
  return user;
}

// POST /auth/password/login — { email, password }
export const passwordLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    if (isStaffEmail(email)) {
      res.status(400).json({ error: 'Forsys accounts sign in with Google.' });
      return;
    }

    const user = await findUserByEmail(email);
    if (!user || !user.passwordHash || !canUsePassword(user)) {
      await bcrypt.compare(password, DUMMY_HASH);
      res.status(401).json({ error: INVALID_CREDENTIALS });
      return;
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      res.status(429).json({ error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.` });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      const lock = attempts >= MAX_FAILED_ATTEMPTS;
      await prisma.user.update({
        where: { id: user.id },
        data: lock
          ? { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MS) }
          : { failedLoginAttempts: attempts },
      });
      logAudit({ userId: user.id, action: lock ? 'user.password_locked' : 'user.password_failed', entityType: 'user', entityId: user.id, req });
      res.status(401).json({ error: INVALID_CREDENTIALS });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

    logAudit({ userId: user.id, action: 'user.password_login', entityType: 'user', entityId: user.id, entityTitle: user.name, req });
    res.json(await buildAuthResponse(updated));
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: INVALID_CREDENTIALS });
      return;
    }
    console.error('[passwordLogin]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /auth/password/verify-token — { token } → who the link is for, so the page can greet them
export const verifyPasswordToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
    const user = await findUserByToken(token);
    if (!user) {
      res.status(400).json({ error: 'This link is invalid or has expired.' });
      return;
    }
    res.json({ email: user.email, name: user.name, hasPassword: !!user.passwordHash });
  } catch {
    res.status(400).json({ error: 'This link is invalid or has expired.' });
  }
};

// POST /auth/password/set — { token, password, name? } → sets the password and signs the user in
export const setPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, password, name } = setPasswordSchema.parse(req.body);
    const user = await findUserByToken(token);
    if (!user) {
      res.status(400).json({ error: 'This link is invalid or has expired.' });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        passwordTokenHash: null,
        passwordTokenExpiry: null,
        emailVerified: true, // the link was delivered to this address
        failedLoginAttempts: 0,
        lockedUntil: null,
        ...(name ? { name } : {}),
      },
    });

    logAudit({ userId: user.id, action: user.passwordHash ? 'user.password_reset' : 'user.password_set', entityType: 'user', entityId: user.id, entityTitle: updated.name, req });
    res.json(await buildAuthResponse(updated));
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message ?? 'Invalid request' });
      return;
    }
    console.error('[setPassword]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /auth/password/forgot — { email } → always 200, so it can't be used to discover accounts.
// Only for users who already have a password: first-time users must use their invite link.
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const user = isStaffEmail(email) ? null : await findUserByEmail(email);
    if (user && user.passwordHash && canUsePassword(user)) {
      const link = await issuePasswordLink(user.id, 'reset');
      sendPasswordResetEmail(user.email, user.name, link).catch((err) => console.error('[forgotPassword] email failed:', err));
      logAudit({ userId: user.id, action: 'user.password_reset_requested', entityType: 'user', entityId: user.id, req });
    }
  } catch (err) {
    if (!(err instanceof z.ZodError)) console.error('[forgotPassword]', err);
  }
  res.json({ message: 'If an account with a password exists for that email, a reset link has been sent.' });
};
