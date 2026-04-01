import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

const TAG_COLORS = ['#4648d4', '#2563eb', '#7c3aed', '#0891b2', '#64748b', '#6b21a8'];

const createTagSchema = z.object({
  name: z.string().min(1).max(32),
  color: z.string().optional(),
});

// List all tags accessible to the user: global tags (initiativeId IS NULL) +
// tags from initiatives they own or are a member of.
export const listAllTags = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get all initiative IDs the user can access (owns or member of)
    const [ownedInitiatives, memberInitiatives] = await Promise.all([
      prisma.initiative.findMany({ where: { createdBy: userId }, select: { id: true } }),
      prisma.initiativeMember.findMany({ where: { userId }, select: { initiativeId: true } }),
    ]);

    const accessibleInitiativeIds = [
      ...ownedInitiatives.map((i) => i.id),
      ...memberInitiatives.map((m) => m.initiativeId),
    ];

    const tags = await prisma.tag.findMany({
      where: {
        OR: [
          { initiativeId: null },
          { initiativeId: { in: accessibleInitiativeIds } },
        ],
      },
      orderBy: { name: 'asc' },
    });

    return res.json({ tags });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
};

// Create a global (workspace-level) tag with no initiative context.
export const createGlobalTag = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createTagSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const { name, color } = parsed.data;
    const tagColor = color || TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];

    // Check if a global tag with this name already exists
    const existing = await prisma.tag.findFirst({ where: { name: name.trim(), initiativeId: null } });
    if (existing) return res.json({ tag: existing });

    const tag = await prisma.tag.create({
      data: { name: name.trim(), color: tagColor, initiativeId: null },
    });

    return res.status(201).json({ tag });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
};
