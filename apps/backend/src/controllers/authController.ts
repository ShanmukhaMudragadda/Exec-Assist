import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import { generateToken } from '../utils/jwt';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const prisma = new PrismaClient();

export const googleAuth = async (req: Request, res: Response): Promise<void> => {
  try {
    const { credential, code, codeVerifier, redirectUri } = req.body as {
      credential?: string;
      code?: string;
      codeVerifier?: string;
      redirectUri?: string;
    };

    let idToken: string | undefined = credential;

    // If authorization code provided, exchange it for tokens server-side
    if (code && codeVerifier && redirectUri) {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        }).toString(),
      });
      const tokens = await tokenRes.json() as { id_token?: string; error?: string; error_description?: string };
      if (!tokens.id_token) {
        res.status(400).json({ error: tokens.error_description || tokens.error || 'Token exchange failed' });
        return;
      }
      idToken = tokens.id_token;
    }

    if (!idToken) {
      res.status(400).json({ error: 'Google credential or authorization code is required' });
      return;
    }

    // Verify the Google ID token — accept both client IDs (web + any additional)
    const audiences = [process.env.GOOGLE_CLIENT_ID!];
    if (process.env.GOOGLE_CLIENT_ID_2) audiences.push(process.env.GOOGLE_CLIENT_ID_2);

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: audiences,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      res.status(400).json({ error: 'Invalid Google token' });
      return;
    }

    const { email, name, picture, email_verified, sub: googleId } = payload;
    console.log('[googleAuth] picture from token:', picture);

    // Find or create user
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: name || email.split('@')[0],
          googleId,
          avatar: picture || null,
          emailVerified: email_verified ?? false,
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: name || user.name,
          googleId: googleId || user.googleId,
          avatar: picture || user.avatar,
          emailVerified: true,
        },
      });
    }

    // Auto-accept any pending invitations for this email
    const pendingInvitations = await prisma.initiativeInvitation.findMany({
      where: { email, status: 'pending' },
    });

    if (pendingInvitations.length > 0) {
      await prisma.$transaction(
        pendingInvitations.flatMap((inv) => [
          (prisma.initiativeMember as any).upsert({
            where: { userId_initiativeId: { userId: user!.id, initiativeId: inv.initiativeId } },
            update: { role: inv.role, department: inv.department },
            create: { userId: user!.id, initiativeId: inv.initiativeId, role: inv.role, department: inv.department },
          }),
          prisma.initiativeInvitation.update({
            where: { id: inv.id },
            data: { status: 'joined' },
          }),
        ])
      );
    }

    console.log('[googleAuth] user.avatar after save:', user.avatar);
    const token = generateToken({ id: user.id, email: user.email, role: user.role });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
        avatar: user.avatar,
        pushNotificationsEnabled: user.pushNotificationsEnabled,
      },
      token,
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(401).json({ error: 'Google authentication failed' });
  }
};

export const getMe = async (
  req: Request & { user?: { id: string; email: string; role: string } },
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, role: true, emailVerified: true,
        avatar: true, timezone: true, createdAt: true, pushNotificationsEnabled: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
};
