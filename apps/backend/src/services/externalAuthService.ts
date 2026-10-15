import crypto from 'crypto';
import { PrismaClient, User } from '@prisma/client';
import { generateToken } from '../utils/jwt';

const prisma = new PrismaClient();

const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;           // 1 hour

// Staff sign in with Google (restricted to the org at the OAuth client); everyone else is external.
// STAFF_EMAIL_DOMAINS is comma-separated, e.g. "forsysinc.com,forsys.com"
const STAFF_DOMAINS = (process.env.STAFF_EMAIL_DOMAINS || 'forsysinc.com')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isStaffEmail(email: string): boolean {
  const domain = normalizeEmail(email).split('@')[1] ?? '';
  return STAFF_DOMAINS.includes(domain);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** A user may use password sign-in only if they are external and have never been staff/superadmin. */
export function canUsePassword(user: Pick<User, 'email' | 'isExternal' | 'googleId' | 'role'>): boolean {
  return user.isExternal && !user.googleId && user.role !== 'superadmin' && !isStaffEmail(user.email);
}

/** Creates a single-use set/reset-password token, stores only its hash, returns the link. */
export async function issuePasswordLink(userId: string, kind: 'invite' | 'reset'): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const ttl = kind === 'invite' ? INVITE_TOKEN_TTL_MS : RESET_TOKEN_TTL_MS;
  await prisma.user.update({
    where: { id: userId },
    data: { passwordTokenHash: hashToken(token), passwordTokenExpiry: new Date(Date.now() + ttl) },
  });
  return `${process.env.APP_URL}/auth/set-password?token=${token}`;
}

/**
 * Finds or creates the user being invited to an initiative. Users outside the staff domain
 * who have never signed in with Google are marked external. Returns a set-password link when
 * the invitee is external and has not set a password yet.
 */
export async function ensureInvitedUser(rawEmail: string): Promise<{ user: User; existed: boolean; setPasswordUrl: string | null }> {
  const email = normalizeEmail(rawEmail);
  const external = !isStaffEmail(email);

  let user = await prisma.user.findUnique({ where: { email } });
  const existed = !!user;
  if (!user) {
    user = await prisma.user.create({
      data: { email, name: email.split('@')[0], emailVerified: false, isExternal: external },
    });
  } else if (external && !user.googleId && !user.isExternal) {
    user = await prisma.user.update({ where: { id: user.id }, data: { isExternal: true } });
  }

  const setPasswordUrl = canUsePassword(user) && !user.passwordHash
    ? await issuePasswordLink(user.id, 'invite')
    : null;

  return { user, existed, setPasswordUrl };
}

/** JWT + user payload returned by every sign-in endpoint. */
export async function buildAuthResponse(user: User) {
  const featureFlags = await prisma.userFeatureFlag.findMany({
    where: { userId: user.id },
    select: { feature: true, enabled: true },
  });
  const token = generateToken({ id: user.id, email: user.email, role: user.role, isExternal: user.isExternal });
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified,
      avatar: user.avatar,
      pushNotificationsEnabled: user.pushNotificationsEnabled,
      isExternal: user.isExternal,
      featureFlags,
    },
    token,
  };
}
