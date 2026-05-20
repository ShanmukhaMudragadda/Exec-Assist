import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { generateToken } from '../utils/jwt';
import { logAudit } from '../services/auditService';

const prisma = new PrismaClient();
const REFRESH_TOKEN_TTL_DAYS = 30;

// In-memory map: state → { port, expiresAt }
const pendingStates = new Map<string, { port: number; expiresAt: number }>();

// Cleanup stale states every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of pendingStates) {
    if (val.expiresAt < now) pendingStates.delete(key);
  }
}, 10 * 60 * 1000);

function issueRefreshToken(): string {
  return 'rft_' + crypto.randomBytes(32).toString('hex');
}

async function storeRefreshToken(userId: string, token: string): Promise<Date> {
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await (prisma.refreshToken as any).create({ data: { userId, token, expiresAt } });
  return expiresAt;
}

// GET /auth/mcp?port=PORT
// Redirects user browser to Google OAuth with backend as redirect_uri
export const initiateMcpAuth = (req: Request, res: Response) => {
  const port = parseInt(req.query.port as string);
  if (!port || isNaN(port) || port < 1024 || port > 65535) {
    res.status(400).json({ error: 'Valid port query param required' });
    return;
  }

  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, { port, expiresAt: Date.now() + 5 * 60 * 1000 });

  const redirectUri = `${process.env.BACKEND_URL ?? `http://localhost:${process.env.PORT ?? 3000}`}/api/auth/mcp/callback`;

  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );

  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'select_account',
  });

  res.redirect(url);
};

// GET /api/auth/mcp/callback?code=...&state=...
// Google redirects here; we exchange code, issue JWT + refresh token, redirect to MCP localhost
export const mcpCallback = async (req: Request, res: Response) => {
  try {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) {
      res.status(400).send(`<h2>Authentication failed: ${error}</h2><p>You can close this tab.</p>`);
      return;
    }

    const pending = pendingStates.get(state);
    if (!pending || pending.expiresAt < Date.now()) {
      pendingStates.delete(state);
      res.status(400).send('<h2>Auth session expired or invalid.</h2><p>Please try again from Claude.</p>');
      return;
    }
    pendingStates.delete(state);

    const backendUrl = process.env.BACKEND_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    const redirectUri = `${backendUrl}/api/auth/mcp/callback`;

    const client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri,
    );

    const { tokens } = await client.getToken(code);
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID!,
    });

    const payload = ticket.getPayload();
    if (!payload?.email) {
      res.status(400).send('<h2>Could not retrieve email from Google.</h2>');
      return;
    }

    const { email, name, picture, email_verified, sub: googleId } = payload;
    const isSuperAdminEmail = email === process.env.SUPER_ADMIN_EMAIL;

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: name ?? email.split('@')[0],
          googleId,
          avatar: picture ?? null,
          emailVerified: email_verified ?? false,
          ...(isSuperAdminEmail ? { role: 'superadmin' } : {}),
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: name ?? user.name,
          googleId: googleId ?? user.googleId,
          avatar: picture ?? user.avatar,
          emailVerified: true,
          ...(isSuperAdminEmail && user.role !== 'superadmin' ? { role: 'superadmin' } : {}),
        },
      });
    }

    const accessToken = generateToken({ id: user.id, email: user.email, role: user.role });
    const refreshTokenStr = issueRefreshToken();
    const expiresAt = await storeRefreshToken(user.id, refreshTokenStr);

    logAudit({
      userId: user.id,
      action: 'user.mcp_login',
      entityType: 'user',
      entityId: user.id,
      entityTitle: user.name,
      req,
    });

    const callbackUrl = new URL(`http://localhost:${pending.port}/callback`);
    callbackUrl.searchParams.set('token', accessToken);
    callbackUrl.searchParams.set('refreshToken', refreshTokenStr);
    callbackUrl.searchParams.set('expiresAt', expiresAt.toISOString());
    callbackUrl.searchParams.set('name', user.name);
    callbackUrl.searchParams.set('email', user.email);

    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>EAssist — Authenticated</title>
        <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#070c1b;color:#e2e8f0;}
        .box{text-align:center;padding:40px;border-radius:16px;background:#0c1428;border:1px solid rgba(99,102,241,0.2);}
        h2{color:#34d399;margin-bottom:8px;}p{color:#64748b;}</style></head>
        <body><div class="box">
          <h2>✓ Authenticated successfully</h2>
          <p>Welcome, ${user.name}. You can close this tab and return to Claude.</p>
        </div></body>
      </html>
      <script>
        fetch('${callbackUrl.toString()}').catch(()=>{});
        setTimeout(()=>window.close(), 2000);
      </script>
    `);
  } catch (err) {
    console.error('[mcpCallback]', err);
    res.status(500).send('<h2>Authentication error. Please try again.</h2>');
  }
};

// POST /auth/refresh  — { refreshToken } → { token, refreshToken, expiresAt }
export const refreshAccessToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) {
      res.status(400).json({ error: 'refreshToken required' });
      return;
    }

    const stored = await (prisma.refreshToken as any).findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.revoked || new Date(stored.expiresAt) < new Date()) {
      res.status(401).json({ error: 'Refresh token invalid or expired' });
      return;
    }

    // Rotate refresh token
    await (prisma.refreshToken as any).update({ where: { id: stored.id }, data: { revoked: true } });

    const newRefreshToken = issueRefreshToken();
    const expiresAt = await storeRefreshToken(stored.userId, newRefreshToken);
    const accessToken = generateToken({ id: stored.user.id, email: stored.user.email, role: stored.user.role });

    res.json({ token: accessToken, refreshToken: newRefreshToken, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    console.error('[refreshAccessToken]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /auth/logout  — { refreshToken } → { success: true }
export const mcpLogout = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (refreshToken) {
      await (prisma.refreshToken as any).updateMany({
        where: { token: refreshToken },
        data: { revoked: true },
      });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[mcpLogout]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
