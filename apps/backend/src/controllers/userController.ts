import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { UpdateProfileSchema } from '../utils/validators';
import { logAudit } from '../services/auditService';

const prisma = new PrismaClient();

export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = UpdateProfileSchema.parse(req.body);
    const userId = req.user!.id;

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true, email: true, name: true, role: true, emailVerified: true,
        avatar: true, timezone: true, pushNotificationsEnabled: true,
      },
    });

    logAudit({
      userId,
      action: 'user.profile_updated',
      entityType: 'user',
      entityId: userId,
      entityTitle: user.name,
      metadata: { fields: Object.keys(data) },
      req,
    });

    res.json({ user });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

export const getUserById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, email: true, avatar: true, role: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
};
