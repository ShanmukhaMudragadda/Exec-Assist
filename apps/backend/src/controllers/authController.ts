import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import { generateToken } from '../utils/jwt';
import { sendWelcomeEmail, sendPasswordResetEmail } from '../services/emailService';
import {
  RegisterSchema, LoginSchema, ResetPasswordSchema, NewPasswordSchema,
} from '../utils/validators';

// Auto-accept any pending workspace invitations for a newly created user
async function acceptPendingInvitations(prisma: PrismaClient, userId: string, email: string): Promise<void> {
  const invitations = await prisma.workspaceInvitation.findMany({
    where: { email, status: 'pending', expiresAt: { gt: new Date() } },
  });
  for (const inv of invitations) {
    const existing = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: inv.workspaceId } },
    });
    if (!existing) {
      await prisma.workspaceMember.create({
        data: { userId, workspaceId: inv.workspaceId, role: 'member', profile: inv.profile || null },
      });
    }
    await prisma.workspaceInvitation.update({
      where: { id: inv.id },
      data: { status: 'accepted' },
    });
  }
}

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const prisma = new PrismaClient();

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = RegisterSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);
    const verifyToken = crypto.randomBytes(32).toString('hex');

    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        password: hashedPassword,
        emailVerifyToken: verifyToken,
      },
    });

    // Send welcome email (non-blocking)
    sendWelcomeEmail(user.email, user.name, verifyToken).catch(console.error);

    // Auto-accept any pending workspace invitations for this email
    acceptPendingInvitations(prisma, user.id, user.email).catch(console.error);

    const token = generateToken({ id: user.id, email: user.email, role: user.role });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
        avatar: user.avatar,
        emailNotifications: user.emailNotifications,
        dailyReportTime: user.dailyReportTime,
      },
      token,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'ZodError') {
      res.status(400).json({ error: 'Validation failed', details: (error as unknown as { errors: unknown[] }).errors });
      return;
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = LoginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = generateToken({ id: user.id, email: user.email, role: user.role });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
        avatar: user.avatar,
        emailNotifications: user.emailNotifications,
        dailyReportTime: user.dailyReportTime,
      },
      token,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'ZodError') {
      res.status(400).json({ error: 'Validation failed' });
      return;
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body as { token: string };

    const user = await prisma.user.findFirst({
      where: { emailVerifyToken: token },
    });

    if (!user) {
      res.status(400).json({ error: 'Invalid or expired verification token' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifyToken: null },
    });

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: 'Email verification failed' });
  }
};

export const requestPasswordReset = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = ResetPasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) {
      // Don't reveal if email exists
      res.json({ message: 'If that email exists, a reset link has been sent' });
      return;
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { resetPasswordToken: resetToken, resetPasswordExpiry: expiresAt },
    });

    sendPasswordResetEmail(user.email, resetToken).catch(console.error);

    res.json({ message: 'If that email exists, a reset link has been sent' });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = NewPasswordSchema.parse(req.body);

    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: data.token,
        resetPasswordExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      res.status(400).json({ error: 'Invalid or expired reset token' });
      return;
    }

    const hashed = await bcrypt.hash(data.password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, resetPasswordToken: null, resetPasswordExpiry: null },
    });

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
};

export const googleAuth = async (req: Request, res: Response): Promise<void> => {
  try {
    const { credential, code, codeVerifier, redirectUri } = req.body as {
      credential?: string;
      code?: string;
      codeVerifier?: string;
      redirectUri?: string;
    };

    console.log('[googleAuth] body keys:', Object.keys(req.body));
    console.log('[googleAuth] GOOGLE_CLIENT_ID set:', !!process.env.GOOGLE_CLIENT_ID);
    console.log('[googleAuth] GOOGLE_CLIENT_SECRET set:', !!process.env.GOOGLE_CLIENT_SECRET);

    let idToken: string | undefined = credential;

    // If authorization code provided, exchange it for tokens server-side
    if (code && codeVerifier && redirectUri) {
      console.log('[googleAuth] Exchanging code with Google, redirectUri:', redirectUri);
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
      console.log('[googleAuth] Google token exchange response:', JSON.stringify({ error: tokens.error, error_description: tokens.error_description, has_id_token: !!tokens.id_token }));
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

    // Verify the Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      res.status(400).json({ error: 'Invalid Google token' });
      return;
    }

    const { email, name, picture, email_verified } = payload;

    // Find or create user
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // New user — create account (no password for OAuth users)
      user = await prisma.user.create({
        data: {
          email,
          name: name || email.split('@')[0],
          password: crypto.randomBytes(32).toString('hex'), // unusable random password
          avatar: picture || null,
          emailVerified: email_verified ?? false,
        },
      });
      // Auto-accept any pending workspace invitations for this email
      acceptPendingInvitations(prisma, user.id, user.email).catch(console.error);
    } else {
      // Existing user — always sync name, avatar, and emailVerified from Google
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: name || user.name,
          avatar: picture || user.avatar,
          emailVerified: true,
        },
      });
    }

    const token = generateToken({ id: user.id, email: user.email, role: user.role });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
        avatar: user.avatar,
        emailNotifications: user.emailNotifications,
        dailyReportTime: user.dailyReportTime,
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
        avatar: true, emailNotifications: true, dailyReportTime: true, createdAt: true,
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
