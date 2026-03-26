import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

// ── helpers ──────────────────────────────────────────────────────────────────

async function canAccess(userId: string, initiativeId: string) {
  const initiative = await prisma.initiative.findUnique({
    where: { id: initiativeId },
    select: { createdBy: true, title: true },
  });
  if (!initiative) return { ok: false, initiative: null, role: null };
  if (initiative.createdBy === userId) return { ok: true, initiative, role: 'owner' };
  const member = await prisma.initiativeMember.findUnique({
    where: { userId_initiativeId: { userId, initiativeId } },
  });
  return { ok: !!member, initiative, role: member?.role ?? null };
}

// owner or admin can edit
function canEdit(role: string | null) {
  return role === 'owner' || role === 'admin';
}

// ── initiative CRUD ───────────────────────────────────────────────────────────

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
  dueDate: z.string().optional().nullable(),
  status: z.enum(['active', 'completed', 'paused', 'at-risk']).optional().default('active'),
});

const updateSchema = createSchema.partial().extend({
  progress: z.number().min(0).max(100).optional(),
});

export const createInitiative = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const data = createSchema.parse(req.body);

    const initiative = await prisma.initiative.create({
      data: {
        createdBy: userId,
        title: data.title,
        description: data.description ?? null,
        priority: data.priority ?? 'medium',
        status: data.status ?? 'active',
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        // Auto-add creator as owner member
        members: {
          create: { userId, role: 'owner' },
        },
        // Create default settings
        settings: {
          create: {},
        },
      },
      include: {
        creator: { select: { id: true, name: true, avatar: true } },
        members: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        _count: { select: { actions: true } },
      },
    });

    return res.status(201).json({ initiative });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const listInitiatives = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get all initiatives the user created or is a member of
    const initiatives = await prisma.initiative.findMany({
      where: {
        OR: [
          { createdBy: userId },
          { members: { some: { userId } } },
        ],
      },
      include: {
        creator: { select: { id: true, name: true, avatar: true } },
        members: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        _count: { select: { actions: true } },
        actions: {
          select: {
            id: true, title: true, status: true, priority: true, dueDate: true,
            assignee: { select: { id: true, name: true, avatar: true } },
            creator: { select: { id: true, name: true, avatar: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const withProgress = initiatives.map((init) => {
      const total = init.actions.length;
      const completed = init.actions.filter((a) => a.status === 'completed').length;
      const computedProgress = total > 0 ? Math.round((completed / total) * 100) : init.progress;
      return { ...init, progress: computedProgress, actionCount: total };
    });

    return res.json({ initiatives: withProgress });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getInitiative = async (req: AuthRequest, res: Response) => {
  try {
    const { initiativeId } = req.params;
    const userId = req.user!.id;

    const { ok, role } = await canAccess(userId, initiativeId);
    if (!ok) return res.status(403).json({ error: 'Access denied' });

    const PAGE = 25;
    const isMemberOnly = !canEdit(role);
    const memberFilter = isMemberOnly ? { OR: [{ assigneeId: userId }, { createdBy: userId }] } : {};

    const [initiative, pending, actionsTotal] = await Promise.all([
      prisma.initiative.findUnique({
        where: { id: initiativeId },
        include: {
          creator: { select: { id: true, name: true, avatar: true } },
          members: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } },
          settings: true,
          tags: true,
          actions: {
            where: memberFilter,
            include: {
              assignee: { select: { id: true, name: true, avatar: true } },
              creator: { select: { id: true, name: true, avatar: true } },
              tags: { include: { tag: true } },
            },
            orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
            take: PAGE + 1,
          },
        },
      }),
      prisma.initiativeInvitation.findMany({
        where: { initiativeId, status: 'pending' },
        select: { id: true, email: true, role: true, department: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.action.count({ where: { initiativeId, ...memberFilter } }),
    ]);

    if (!initiative) return res.status(404).json({ error: 'Initiative not found' });

    const hasMore = initiative.actions.length > PAGE;
    const actions = hasMore ? initiative.actions.slice(0, PAGE) : initiative.actions;
    const nextCursor = hasMore ? actions[actions.length - 1].id : null;

    // Progress computed from full count
    const completedCount = await prisma.action.count({ where: { initiativeId, status: 'completed' } });
    const computedProgress = actionsTotal > 0 ? Math.round((completedCount / actionsTotal) * 100) : initiative.progress;

    return res.json({
      initiative: {
        ...initiative,
        actions,
        progress: computedProgress,
        pending,
        actionsMeta: { total: actionsTotal, hasMore, nextCursor },
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const listActions = async (req: AuthRequest, res: Response) => {
  try {
    const { initiativeId } = req.params;
    const userId = req.user!.id;
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string || '25', 10), 100);

    const { ok, role } = await canAccess(userId, initiativeId);
    if (!ok) return res.status(403).json({ error: 'Access denied' });

    const isMemberOnly = !canEdit(role);
    const memberFilter = isMemberOnly ? { OR: [{ assigneeId: userId }, { createdBy: userId }] } : {};

    const actions = await prisma.action.findMany({
      where: { initiativeId, ...memberFilter },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        assignee: { select: { id: true, name: true, avatar: true } },
        creator: { select: { id: true, name: true, avatar: true } },
        tags: { include: { tag: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: limit + 1,
    });

    const hasMore = actions.length > limit;
    const data = hasMore ? actions.slice(0, limit) : actions;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return res.json({ actions: data, meta: { hasMore, nextCursor } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateInitiative = async (req: AuthRequest, res: Response) => {
  try {
    const { initiativeId } = req.params;
    const userId = req.user!.id;
    const data = updateSchema.parse(req.body);

    const { ok, role } = await canAccess(userId, initiativeId);
    if (!ok) return res.status(403).json({ error: 'Access denied' });
    if (!canEdit(role)) return res.status(403).json({ error: 'Only owners and admins can edit the initiative' });

    const updated = await prisma.initiative.update({
      where: { id: initiativeId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.progress !== undefined && { progress: data.progress }),
        ...(data.dueDate !== undefined && { dueDate: data.dueDate ? new Date(data.dueDate) : null }),
      },
      include: { creator: { select: { id: true, name: true, avatar: true } } },
    });

    return res.json({ initiative: updated });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteInitiative = async (req: AuthRequest, res: Response) => {
  try {
    const { initiativeId } = req.params;
    const userId = req.user!.id;

    const initiative = await prisma.initiative.findUnique({ where: { id: initiativeId } });
    if (!initiative) return res.status(404).json({ error: 'Initiative not found' });
    if (initiative.createdBy !== userId) return res.status(403).json({ error: 'Only the creator can delete' });

    await prisma.initiative.delete({ where: { id: initiativeId } });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ── members ───────────────────────────────────────────────────────────────────

export const listMembers = async (req: AuthRequest, res: Response) => {
  try {
    const { initiativeId } = req.params;
    const userId = req.user!.id;

    const { ok } = await canAccess(userId, initiativeId);
    if (!ok) return res.status(403).json({ error: 'Access denied' });

    const [members, pending] = await Promise.all([
      prisma.initiativeMember.findMany({
        where: { initiativeId },
        include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
      }),
      prisma.initiativeInvitation.findMany({
        where: { initiativeId, status: 'pending' },
        select: { id: true, email: true, role: true, department: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return res.json({ members, pending });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateMember = async (req: AuthRequest, res: Response) => {
  try {
    const { initiativeId, memberId } = req.params;
    const userId = req.user!.id;

    const { ok, role } = await canAccess(userId, initiativeId);
    if (!ok) return res.status(403).json({ error: 'Access denied' });
    if (!canEdit(role)) return res.status(403).json({ error: 'Only owners and admins can edit members' });

    const updateSchema = z.object({
      role: z.enum(['admin', 'member']).optional(),
      department: z.string().optional().nullable(),
    });
    const data = updateSchema.parse(req.body);

    const updated = await prisma.initiativeMember.update({
      where: { userId_initiativeId: { userId: memberId, initiativeId } },
      data: {
        ...(data.role !== undefined && { role: data.role }),
        ...(data.department !== undefined && { department: data.department ?? null }),
      },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });
    return res.json({ member: updated });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const removeMember = async (req: AuthRequest, res: Response) => {
  try {
    const { initiativeId, memberId } = req.params;
    const userId = req.user!.id;

    const initiative = await prisma.initiative.findUnique({ where: { id: initiativeId } });
    if (!initiative) return res.status(404).json({ error: 'Initiative not found' });
    if (initiative.createdBy !== userId) return res.status(403).json({ error: 'Only the creator can remove members' });

    await prisma.initiativeMember.deleteMany({ where: { initiativeId, userId: memberId } });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ── add member ────────────────────────────────────────────────────────────────

const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']).optional().default('member'),
  department: z.string().optional().nullable(),
});

export const addMember = async (req: AuthRequest, res: Response) => {
  try {
    const { initiativeId } = req.params;
    const userId = req.user!.id;
    const data = addMemberSchema.parse(req.body);

    const { ok, initiative: init, role } = await canAccess(userId, initiativeId);
    if (!ok) return res.status(403).json({ error: 'Access denied' });
    if (!canEdit(role)) return res.status(403).json({ error: 'Only owners and admins can add members' });

    const { sendMemberAddedEmail } = await import('../services/emailService');

    // Check if the user already has an account
    const existingUser = await prisma.user.findUnique({ where: { email: data.email } });

    const initiativeTitle = init?.title ?? 'an initiative';
    const inviter = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const inviterName = inviter?.name || 'A teammate';

    if (existingUser) {
      // Directly add as member
      const member = await (prisma.initiativeMember as any).upsert({
        where: { userId_initiativeId: { userId: existingUser.id, initiativeId } },
        update: { role: data.role ?? 'member', department: data.department ?? null },
        create: { userId: existingUser.id, initiativeId, role: data.role ?? 'member', department: data.department ?? null },
        include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
      });

      sendMemberAddedEmail(data.email, initiativeTitle, inviterName, initiativeId)
        .catch((err: unknown) => console.error('Member added email failed:', err));

      return res.status(201).json({ member, pending: null });
    }

    // User doesn't have an account yet — create or update pending invitation
    const existingInvite = await prisma.initiativeInvitation.findFirst({
      where: { email: data.email, initiativeId, status: 'pending' },
    });

    let pending;
    if (existingInvite) {
      pending = await prisma.initiativeInvitation.update({
        where: { id: existingInvite.id },
        data: { role: data.role ?? 'member', department: data.department ?? null, invitedBy: userId },
      });
    } else {
      pending = await (prisma.initiativeInvitation as any).create({
        data: { email: data.email, initiativeId, invitedBy: userId, role: data.role ?? 'member', department: data.department ?? null },
      });
    }

    sendMemberAddedEmail(data.email, initiativeTitle, inviterName, initiativeId)
      .catch((err: unknown) => console.error('Member added email failed:', err));

    return res.status(201).json({ member: null, pending: { id: pending.id, email: pending.email, role: pending.role, department: pending.department, createdAt: pending.createdAt } });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ── settings ──────────────────────────────────────────────────────────────────

const settingsSchema = z.object({
  emailNotifications: z.boolean().optional(),
  dailyReportEnabled: z.boolean().optional(),
  dailyReportTime: z.string().optional(),
  dailyReportEmails: z.array(z.string().email()).optional(),
});

export const getSettings = async (req: AuthRequest, res: Response) => {
  try {
    const { initiativeId } = req.params;
    const userId = req.user!.id;

    const { ok } = await canAccess(userId, initiativeId);
    if (!ok) return res.status(403).json({ error: 'Access denied' });

    let settings = await prisma.initiativeSettings.findUnique({ where: { initiativeId } });
    if (!settings) {
      settings = await prisma.initiativeSettings.create({ data: { initiativeId } });
    }
    return res.json({ settings });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateSettings = async (req: AuthRequest, res: Response) => {
  try {
    const { initiativeId } = req.params;
    const userId = req.user!.id;
    const data = settingsSchema.parse(req.body);

    const { ok, role } = await canAccess(userId, initiativeId);
    if (!ok) return res.status(403).json({ error: 'Access denied' });
    if (!canEdit(role)) return res.status(403).json({ error: 'Only owners and admins can update settings' });

    const settings = await prisma.initiativeSettings.upsert({
      where: { initiativeId },
      update: data,
      create: { initiativeId, ...data },
    });
    return res.json({ settings });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ── tags ──────────────────────────────────────────────────────────────────────

const tagSchema = z.object({
  name: z.string().min(1).max(32),
  color: z.string().optional().default('#4648d4'),
});

export const listTags = async (req: AuthRequest, res: Response) => {
  try {
    const { initiativeId } = req.params;
    const userId = req.user!.id;

    const { ok } = await canAccess(userId, initiativeId);
    if (!ok) return res.status(403).json({ error: 'Access denied' });

    const tags = await prisma.tag.findMany({ where: { initiativeId }, orderBy: { name: 'asc' } });
    return res.json({ tags });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createTag = async (req: AuthRequest, res: Response) => {
  try {
    const { initiativeId } = req.params;
    const userId = req.user!.id;
    const data = tagSchema.parse(req.body);

    const { ok, role } = await canAccess(userId, initiativeId);
    if (!ok) return res.status(403).json({ error: 'Access denied' });
    if (!canEdit(role)) return res.status(403).json({ error: 'Only owners and admins can create tags' });

    const tag = await prisma.tag.upsert({
      where: { name_initiativeId: { name: data.name, initiativeId } },
      update: { color: data.color ?? '#4648d4' },
      create: { initiativeId, name: data.name, color: data.color ?? '#4648d4' },
    });
    return res.status(201).json({ tag });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteTag = async (req: AuthRequest, res: Response) => {
  try {
    const { initiativeId, tagId } = req.params;
    const userId = req.user!.id;

    const { ok, role } = await canAccess(userId, initiativeId);
    if (!ok) return res.status(403).json({ error: 'Access denied' });
    if (!canEdit(role)) return res.status(403).json({ error: 'Only owners and admins can delete tags' });

    await prisma.tag.deleteMany({ where: { id: tagId, initiativeId } });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
