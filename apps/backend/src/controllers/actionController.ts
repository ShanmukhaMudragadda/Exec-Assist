import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

async function canAccess(userId: string, initiativeId: string) {
  const initiative = await prisma.initiative.findUnique({ where: { id: initiativeId }, select: { createdBy: true } });
  if (!initiative) return false;
  if (initiative.createdBy === userId) return true;
  const member = await prisma.initiativeMember.findUnique({
    where: { userId_initiativeId: { userId, initiativeId } },
  });
  return !!member;
}

// For actions that may have no initiative (standalone), check access at action level
async function canAccessAction(userId: string, action: { initiativeId: string | null; createdBy: string; assigneeId: string | null }) {
  if (!action.initiativeId) {
    return action.createdBy === userId || action.assigneeId === userId;
  }
  return canAccess(userId, action.initiativeId);
}

const ACTION_INCLUDE = {
  assignee: { select: { id: true, name: true, avatar: true } },
  creator: { select: { id: true, name: true, avatar: true } },
  tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
} as const;

const createSchema = z.object({
  initiativeId: z.string().optional().nullable(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
  status: z.enum(['todo', 'in-progress', 'in-review', 'completed']).optional().default('todo'),
  dueDate: z.string().optional().nullable(),
  sourceType: z.string().optional().nullable(),
  sourceId: z.string().optional().nullable(),
  tagIds: z.array(z.string()).optional().default([]),
});

const updateSchema = z.object({
  initiativeId: z.string().optional().nullable(),
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.enum(['todo', 'in-progress', 'in-review', 'completed']).optional(),
  dueDate: z.string().optional().nullable(),
  tagIds: z.array(z.string()).optional(),
});

const bulkCreateItemSchema = z.object({
  initiativeId: z.string().optional().nullable(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
  status: z.enum(['todo', 'in-progress', 'in-review', 'completed']).optional().default('todo'),
  dueDate: z.string().optional().nullable(),
  sourceType: z.string().optional().nullable(),
  sourceId: z.string().optional().nullable(),
  tagIds: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]), // tag names from AI — resolved to IDs server-side
});
const bulkCreateSchema = z.array(bulkCreateItemSchema);

export const createAction = async (req: AuthRequest, res: Response) => {
  try {
    // initiativeId may come from route param (nested route) or body (standalone route)
    const { initiativeId: paramInitiativeId } = req.params;
    const userId = req.user!.id;
    const data = createSchema.parse(req.body);
    const initiativeId = paramInitiativeId || data.initiativeId || null;

    if (initiativeId && !(await canAccess(userId, initiativeId))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const action = await prisma.action.create({
      data: {
        initiativeId: initiativeId ?? null,
        createdBy: userId,
        assigneeId: data.assigneeId ?? null,
        title: data.title,
        description: data.description ?? null,
        priority: data.priority ?? 'medium',
        status: data.status ?? 'todo',
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        sourceType: data.sourceType ?? 'manual',
        sourceId: data.sourceId ?? null,
        tags: data.tagIds?.length
          ? { create: data.tagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
      include: ACTION_INCLUDE,
    });

    return res.status(201).json({ action });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const bulkCreateActions = async (req: AuthRequest, res: Response) => {
  try {
    const { initiativeId } = req.params;
    const userId = req.user!.id;
    const items = bulkCreateSchema.parse(req.body.actions);

    if (!(await canAccess(userId, initiativeId))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Collect all unique tag names that need to be resolved to IDs
    const allTagNames = [...new Set(items.flatMap((item) => item.tags ?? []).map((n) => n.trim()).filter(Boolean))];

    // Find existing tags for this initiative
    const existingTags = allTagNames.length
      ? await prisma.tag.findMany({ where: { initiativeId, name: { in: allTagNames } } })
      : [];

    // Create any missing tags
    const existingNames = new Set(existingTags.map((t) => t.name));
    const missingNames = allTagNames.filter((n) => !existingNames.has(n));
    const TAG_COLORS = ['#4648d4', '#2563eb', '#7c3aed', '#0891b2', '#64748b', '#6b21a8'];
    const newTags = missingNames.length
      ? await prisma.$transaction(
          missingNames.map((name, i) =>
            prisma.tag.create({ data: { id: randomUUID(), name, initiativeId, color: TAG_COLORS[i % TAG_COLORS.length] } })
          )
        )
      : [];

    const tagByName = new Map([...existingTags, ...newTags].map((t) => [t.name, t.id]));

    const created = await prisma.$transaction(
      items.map((item) => {
        // Merge explicit tagIds + resolved tag names
        const resolvedIds = (item.tags ?? []).map((n) => tagByName.get(n.trim())).filter(Boolean) as string[];
        const finalTagIds = [...new Set([...(item.tagIds ?? []), ...resolvedIds])];
        return prisma.action.create({
          data: {
            initiativeId,
            createdBy: userId,
            assigneeId: item.assigneeId ?? null,
            title: item.title,
            description: item.description ?? null,
            priority: item.priority ?? 'medium',
            status: item.status ?? 'todo',
            dueDate: item.dueDate ? new Date(item.dueDate) : null,
            sourceType: item.sourceType ?? 'ai',
            sourceId: item.sourceId ?? null,
            tags: finalTagIds.length
              ? { create: finalTagIds.map((tagId) => ({ tagId })) }
              : undefined,
          },
          include: ACTION_INCLUDE,
        });
      })
    );

    return res.status(201).json({ actions: created, count: created.length });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateAction = async (req: AuthRequest, res: Response) => {
  try {
    const { actionId } = req.params;
    const userId = req.user!.id;
    const data = updateSchema.parse(req.body);

    const action = await prisma.action.findUnique({ where: { id: actionId } });
    if (!action) return res.status(404).json({ error: 'Action not found' });

    if (!(await canAccessAction(userId, action))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // If moving to a new initiative, verify access to the target initiative
    if (data.initiativeId && data.initiativeId !== action.initiativeId) {
      if (!(await canAccess(userId, data.initiativeId))) {
        return res.status(403).json({ error: 'Access denied to target initiative' });
      }
    }

    const updated = await prisma.action.update({
      where: { id: actionId },
      data: {
        ...(data.initiativeId !== undefined && { initiativeId: data.initiativeId ?? null }),
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.assigneeId !== undefined && { assigneeId: data.assigneeId }),
        ...(data.dueDate !== undefined && { dueDate: data.dueDate ? new Date(data.dueDate) : null }),
        ...(data.tagIds !== undefined && {
          tags: {
            deleteMany: {},
            create: data.tagIds.map((tagId) => ({ tagId })),
          },
        }),
      },
      include: ACTION_INCLUDE,
    });

    return res.json({ action: updated });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteAction = async (req: AuthRequest, res: Response) => {
  try {
    const { actionId } = req.params;
    const userId = req.user!.id;

    const action = await prisma.action.findUnique({ where: { id: actionId } });
    if (!action) return res.status(404).json({ error: 'Action not found' });

    if (action.initiativeId) {
      // Only the initiative creator can delete initiative actions
      const initiative = await prisma.initiative.findUnique({
        where: { id: action.initiativeId },
        select: { createdBy: true },
      });
      if (!initiative || initiative.createdBy !== userId) {
        return res.status(403).json({ error: 'Only the initiative owner can delete actions' });
      }
    } else {
      // Standalone action: only the creator can delete
      if (action.createdBy !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    await prisma.action.delete({ where: { id: actionId } });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getCommandCenter = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // All initiatives the user owns or is a member of
    const userInitiatives = await prisma.initiative.findMany({
      where: {
        OR: [
          { createdBy: userId },
          { members: { some: { userId } } },
        ],
      },
      select: { id: true },
    });
    const initiativeIds = userInitiatives.map((i) => i.id);

    const actions = await prisma.action.findMany({
      where: {
        OR: [
          { assigneeId: userId },
          { createdBy: userId },
          ...(initiativeIds.length ? [{ initiativeId: { in: initiativeIds } }] : []),
        ],
      },
      include: {
        initiative: { select: { id: true, title: true, status: true } },
        creator: { select: { id: true, name: true, avatar: true } },
        assignee: { select: { id: true, name: true, avatar: true } },
        tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    });

    const grouped = {
      todo: actions.filter((a) => a.status === 'todo'),
      'in-progress': actions.filter((a) => a.status === 'in-progress'),
      'in-review': actions.filter((a) => a.status === 'in-review'),
      completed: actions.filter((a) => a.status === 'completed'),
    };

    const stats = {
      total: actions.length,
      completed: grouped.completed.length,
      inProgress: grouped['in-progress'].length + grouped['in-review'].length,
      todo: grouped.todo.length,
      overdue: actions.filter(
        (a) => a.dueDate && new Date(a.dueDate) < new Date() && a.status !== 'completed'
      ).length,
    };

    return res.json({ actions, grouped, stats });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const generateActionsFromTranscript = async (req: AuthRequest, res: Response) => {
  try {
    const { initiativeId } = req.params;
    const userId = req.user!.id;
    const { content, title, aiSettings } = req.body as {
      content: string;
      title?: string;
      aiSettings?: {
        autoAssignOwners?: boolean;
        includeDeadlines?: boolean;
        priorityDetection?: boolean;
        executiveFocus?: boolean;
      };
    };

    if (!(await canAccess(userId, initiativeId))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const members = await prisma.initiativeMember.findMany({
      where: { initiativeId },
      include: { user: { select: { id: true, name: true } } },
    });

    // Also include the initiative creator if not already a member
    const initiative = await prisma.initiative.findUnique({
      where: { id: initiativeId },
      include: { creator: { select: { id: true, name: true } } },
    });

    const { extractTasksFromTranscript } = await import('../services/AIService');
    const membersList = members.map((m) => ({ id: m.userId, name: m.user.name, profile: (m as any).department || undefined }));
    // Add creator if not in members list
    if (initiative?.creator && !membersList.find((ml) => ml.id === initiative.creator.id)) {
      membersList.unshift({ id: initiative.creator.id, name: initiative.creator.name, profile: 'owner' });
    }
    const extracted = await extractTasksFromTranscript(content, membersList, aiSettings);

    const actions = extracted.map((t) => ({
      title: t.title,
      description: t.description ?? null,
      priority: t.priority,
      dueDate: t.dueDate ?? null,
      assigneeId: t.assigneeIds[0] ?? null,
      sourceType: 'transcript',
      tags: t.tags,
    }));

    return res.json({ actions, count: actions.length });
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
};

export const getExecutiveBrief = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });

    const userInitiatives = await prisma.initiative.findMany({
      where: { OR: [{ createdBy: userId }, { members: { some: { userId } } }] },
      include: { actions: { select: { status: true, dueDate: true, priority: true } } },
    });

    const now = new Date();
    const allActions = await prisma.action.findMany({
      where: {
        OR: [
          { createdBy: userId },
          { assigneeId: userId },
          ...(userInitiatives.length ? [{ initiativeId: { in: userInitiatives.map((i) => i.id) } }] : []),
        ],
      },
      select: { status: true, dueDate: true, priority: true, updatedAt: true },
    });

    const isToday = (d: Date) => {
      const t = new Date(); return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
    };

    const ctx = {
      userName: user?.name?.split(' ')[0] || 'Executive',
      initiatives: userInitiatives.map((i) => ({
        title: i.title,
        status: i.status,
        progress: i.progress || 0,
        actionCount: i.actions.length,
        overdueCount: i.actions.filter((a) => a.dueDate && new Date(a.dueDate) < now && a.status !== 'completed').length,
      })),
      totalActions: allActions.length,
      openActions: allActions.filter((a) => a.status !== 'completed').length,
      overdueActions: allActions.filter((a) => a.dueDate && new Date(a.dueDate) < now && a.status !== 'completed').length,
      urgentActions: allActions.filter((a) => a.priority === 'urgent' && a.status !== 'completed').length,
      completedToday: allActions.filter((a) => a.status === 'completed' && isToday(new Date(a.updatedAt))).length,
      dueToday: allActions.filter((a) => a.dueDate && isToday(new Date(a.dueDate)) && a.status !== 'completed').length,
    };

    const { generateExecutiveBrief } = await import('../services/AIService');
    const brief = await generateExecutiveBrief(ctx);
    return res.json({ brief });
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
};

// Standalone generate (no initiative context)
export const generateStandaloneActions = async (req: AuthRequest, res: Response) => {
  try {
    const { content } = req.body as { content: string };
    if (!content?.trim()) return res.status(400).json({ error: 'Content is required' });

    const { extractTasksFromTranscript } = await import('../services/AIService');
    const extracted = await extractTasksFromTranscript(content, [], undefined);

    const actions = extracted.map((t) => ({
      title: t.title,
      description: t.description ?? null,
      priority: t.priority,
      dueDate: t.dueDate ?? null,
      tags: t.tags,
    }));

    return res.json({ actions, count: actions.length });
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
};

// ── Action Detail + Updates ───────────────────────────────────────────────────

export const getAction = async (req: AuthRequest, res: Response) => {
  try {
    const { actionId } = req.params;
    const userId = req.user!.id;

    const BASE_INCLUDE = {
      assignee: { select: { id: true, name: true, avatar: true } },
      creator: { select: { id: true, name: true, avatar: true } },
      tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      initiative: { select: { id: true, title: true, status: true } },
    } as const;

    // Try with updates; fall back gracefully if ActionUpdate table not yet in Prisma client
    let action: any;
    try {
      action = await (prisma.action.findUnique as any)({
        where: { id: actionId },
        include: {
          ...BASE_INCLUDE,
          updates: {
            include: { user: { select: { id: true, name: true, avatar: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
    } catch {
      action = await prisma.action.findUnique({ where: { id: actionId }, include: BASE_INCLUDE });
      if (action) action.updates = [];
    }

    if (!action) return res.status(404).json({ error: 'Action not found' });

    if (!(await canAccessAction(userId, action))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    return res.json({ action });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createActionUpdate = async (req: AuthRequest, res: Response) => {
  try {
    const { actionId } = req.params;
    const userId = req.user!.id;
    const { content } = req.body as { content: string };

    if (!content?.trim()) return res.status(400).json({ error: 'Content is required' });

    const action = await prisma.action.findUnique({ where: { id: actionId }, select: { initiativeId: true, createdBy: true, assigneeId: true } });
    if (!action) return res.status(404).json({ error: 'Action not found' });

    if (!(await canAccessAction(userId, action))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    try {
      const update = await (prisma.actionUpdate as any).create({
        data: { actionId, userId, content: content.trim() },
        include: { user: { select: { id: true, name: true, avatar: true } } },
      });
      return res.status(201).json({ update });
    } catch {
      // ActionUpdate not in Prisma client yet — instruct to run prisma generate
      return res.status(503).json({ error: 'Updates not available yet. Run: npx prisma generate and restart the server.' });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
