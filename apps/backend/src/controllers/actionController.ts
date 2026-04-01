import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { any, z } from 'zod';
import { randomUUID } from 'crypto';
import { AuthRequest } from '../middleware/auth';
import { sendMentionNotificationEmail } from '../services/emailService';
import { queueActionAssignmentEmail } from '../queue/emailQueue';
import { sendPushNotification } from '../services/pushService';

/** Extract unique userIds from @[Name](userId) mention tokens */
function parseMentionIds(content: string): string[] {
  const regex = /@\[[^\]]+\]\(([^)]+)\)/g;
  const ids: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) ids.push(match[1]);
  return [...new Set(ids)];
}

async function notifyMentions(content: string, posterId: string, actionId: string) {
  const mentionedIds = parseMentionIds(content);
  if (!mentionedIds.length) return;
  const [action, poster, mentionedUsers] = await Promise.all([
    prisma.action.findUnique({ where: { id: actionId }, select: { title: true, initiativeId: true } }),
    prisma.user.findUnique({ where: { id: posterId }, select: { name: true } }),
    prisma.user.findMany({ where: { id: { in: mentionedIds } }, select: { id: true, name: true, email: true, pushNotificationsEnabled: true } }),
  ]);
  if (!action || !poster) return;
  await Promise.all(
    mentionedUsers
      .filter((u) => u.id !== posterId)
      .map((u) => {
        const emailP = sendMentionNotificationEmail(u.email, u.name, poster.name, action.title, actionId, action.initiativeId, content);
        const pushP = u.pushNotificationsEnabled
          ? sendPushNotification(u.id, {
              title: `${poster.name} mentioned you`,
              body: `In "${action.title}"`,
              url: action.initiativeId ? `/initiatives/${action.initiativeId}` : '/command-center',
              tag: `mention-${actionId}`,
            }).catch(console.error)
          : Promise.resolve();
        return Promise.all([emailP, pushP]);
      })
  );
}

const prisma = new PrismaClient();

async function canAccess(userId: string, initiativeId: string): Promise<{ ok: boolean; role: string | null }> {
  const initiative = await prisma.initiative.findUnique({ where: { id: initiativeId }, select: { createdBy: true } });
  if (!initiative) return { ok: false, role: null };
  if (initiative.createdBy === userId) return { ok: true, role: 'owner' };
  const member = await prisma.initiativeMember.findUnique({
    where: { userId_initiativeId: { userId, initiativeId } },
  });
  return { ok: !!member, role: member?.role ?? null };
}

function canEdit(role: string | null) {
  return role === 'owner' || role === 'admin';
}

// For actions that may have no initiative (standalone), check access at action level
async function canAccessAction(userId: string, action: { initiativeId: string | null; createdBy: string; assigneeId: string | null }): Promise<{ ok: boolean; canModify: boolean; role: string | null }> {
  const isOwnerOrAssignee = action.createdBy === userId || action.assigneeId === userId;
  if (!action.initiativeId) {
    return { ok: isOwnerOrAssignee, canModify: isOwnerOrAssignee, role: null };
  }
  const { ok, role } = await canAccess(userId, action.initiativeId);
  if (!ok) return { ok: false, canModify: false, role: null };
  // owners/admins can modify any action; members can only modify their own
  return { ok: true, canModify: canEdit(role) || isOwnerOrAssignee, role };
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

    if (initiativeId && !(await canAccess(userId, initiativeId)).ok) {
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

    // Notify assignee via email + push (skip if self-assigned)
    if (action.assigneeId && action.assigneeId !== userId) {
      const assignee = await prisma.user.findUnique({
        where: { id: action.assigneeId },
        select: { email: true, name: true, pushNotificationsEnabled: true },
      });
      if (assignee) {
        queueActionAssignmentEmail(assignee.email, assignee.name, action.title, action.id, action.initiativeId ?? '');
        if (assignee.pushNotificationsEnabled) {
          sendPushNotification(action.assigneeId, {
            title: 'New Action Assigned',
            body: action.title,
            url: action.initiativeId ? `/initiatives/${action.initiativeId}` : '/command-center',
            tag: `action-assigned-${action.id}`,
          }).catch((err) => console.error('[push] action assign push failed:', err));
        }
      }
    }

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

    if (!(await canAccess(userId, initiativeId)).ok) {
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

    // Notify each unique assignee of their newly assigned actions (skip self-assigned)
    const assigneeGroups = new Map<string, string[]>();
    for (const a of created) {
      if (a.assigneeId && a.assigneeId !== userId) {
        if (!assigneeGroups.has(a.assigneeId)) assigneeGroups.set(a.assigneeId, []);
        assigneeGroups.get(a.assigneeId)!.push(a.title);
      }
    }
    if (assigneeGroups.size) {
      prisma.user
        .findMany({ where: { id: { in: [...assigneeGroups.keys()] }, pushNotificationsEnabled: true }, select: { id: true } })
        .then((users) =>
          users.forEach((u) => {
            const titles = assigneeGroups.get(u.id)!;
            sendPushNotification(u.id, {
              title: 'New Actions Assigned',
              body: titles.length === 1 ? titles[0] : `${titles.length} new actions assigned to you`,
              url: `/initiatives/${initiativeId}`,
              tag: `bulk-assigned-${initiativeId}`,
            }).catch((err) => console.error('[push] bulk assign push failed:', err));
          })
        )
        .catch(console.error);
    }

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
    const previousAssigneeId = action.assigneeId;

    const { ok, canModify } = await canAccessAction(userId, action);
    if (!ok || !canModify) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // If moving to a new initiative, verify access to the target initiative
    if (data.initiativeId && data.initiativeId !== action.initiativeId) {
      if (!(await canAccess(userId, data.initiativeId)).ok) {
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

    // Notify new assignee if reassigned (skip if self-assigned)
    const newAssigneeId = updated.assigneeId;
    if (newAssigneeId && newAssigneeId !== previousAssigneeId && newAssigneeId !== userId) {
      const assignee = await prisma.user.findUnique({
        where: { id: newAssigneeId },
        select: { email: true, name: true, pushNotificationsEnabled: true },
      });
      if (assignee) {
        queueActionAssignmentEmail(assignee.email, assignee.name, updated.title, updated.id, updated.initiativeId ?? '');
        if (assignee.pushNotificationsEnabled) {
          sendPushNotification(newAssigneeId, {
            title: 'New Action Assigned',
            body: updated.title,
            url: updated.initiativeId ? `/initiatives/${updated.initiativeId}` : '/command-center',
            tag: `action-assigned-${updated.id}`,
          }).catch((err) => console.error('[push] reassign push failed:', err));
        }
      }
    }

    // Notify creator and assignee on status change (skip the person making the change)
    if (data.status && data.status !== action.status) {
      const statusLabel: Record<string, string> = {
        'todo': 'To Do', 'in-progress': 'In Progress', 'in-review': 'In Review', 'completed': 'Completed',
      };
      const notifyIds = new Set<string>();
      if (updated.createdBy !== userId) notifyIds.add(updated.createdBy);
      if (updated.assigneeId && updated.assigneeId !== userId) notifyIds.add(updated.assigneeId);
      if (notifyIds.size) {
        prisma.user
          .findMany({ where: { id: { in: [...notifyIds] }, pushNotificationsEnabled: true }, select: { id: true } })
          .then((users) =>
            users.forEach((u) =>
              sendPushNotification(u.id, {
                title: data.status === 'completed' ? '✅ Action Completed' : 'Action Status Updated',
                body: `"${updated.title}" → ${statusLabel[data.status!] ?? data.status}`,
                url: updated.initiativeId ? `/initiatives/${updated.initiativeId}` : '/command-center',
                tag: `action-status-${updated.id}`,
              }).catch((err) => console.error('[push] status change push failed:', err))
            )
          )
          .catch(console.error);
      }
    }

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
      const { ok, role } = await canAccess(userId, action.initiativeId);
      if (!ok) return res.status(403).json({ error: 'Access denied' });
      // owners/admins can delete any action; members can only delete actions they created
      if (!canEdit(role) && action.createdBy !== userId) {
        return res.status(403).json({ error: 'Access denied' });
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
    const cursor = req.query.cursor as string | undefined;
    const filter = req.query.filter as string | undefined;
    const search = (req.query.search as string | undefined)?.trim();
    const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 100);

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

    const now = new Date();

    const accessCondition = {
      OR: [
        { assigneeId: userId },
        { createdBy: userId },
        ...(initiativeIds.length ? [{ initiativeId: { in: initiativeIds } }] : []),
      ],
    };

    const filterCondition =
      filter === 'open'      ? { status: { notIn: ['completed'] } } :
      filter === 'completed' ? { status: 'completed' as const } :
      filter === 'overdue'   ? { dueDate: { lt: now }, status: { notIn: ['completed'] } } :
      null;

    const searchCondition = search ? {
      OR: [
        { title: { contains: search, mode: 'insensitive' as const } },
        { description: { contains: search, mode: 'insensitive' as const } },
      ],
    } : null;

    // Base scope for counts: access + search (no filter) — so all tabs show accurate numbers
    const baseClauses: object[] = [accessCondition];
    if (searchCondition) baseClauses.push(searchCondition);
    const baseWhere = baseClauses.length === 1 ? baseClauses[0] : { AND: baseClauses };

    // Filtered scope for the actual action list
    const andClauses: object[] = [...baseClauses];
    if (filterCondition) andClauses.push(filterCondition);
    const actionWhere = andClauses.length === 1 ? andClauses[0] : { AND: andClauses };

    const [actions, counts] = await Promise.all([
      prisma.action.findMany({
        where: actionWhere as any,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          initiative: { select: { id: true, title: true, status: true } },
          creator: { select: { id: true, name: true, avatar: true } },
          assignee: { select: { id: true, name: true, avatar: true } },
          tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
        },
        orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
        take: limit + 1,
      }),
      Promise.all([
        prisma.action.count({ where: baseWhere as any }),
        prisma.action.count({ where: { AND: [baseWhere, { status: { notIn: ['completed'] } }] } as any }),
        prisma.action.count({ where: { AND: [baseWhere, { dueDate: { lt: now }, status: { notIn: ['completed'] } }] } as any }),
        prisma.action.count({ where: { AND: [baseWhere, { status: 'completed' }] } as any }),
      ]),
    ]);

    const [allCount, openCount, overdueCount, completedCount] = counts;
    const filteredTotal = filterCondition
      ? (filter === 'open' ? openCount : filter === 'overdue' ? overdueCount : completedCount)
      : allCount;

    const hasMore = actions.length > limit;
    const data = hasMore ? actions.slice(0, limit) : actions;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    const stats = { all: allCount, open: openCount, overdue: overdueCount, completed: completedCount };

    return res.json({ actions: data, meta: { total: filteredTotal, hasMore, nextCursor }, stats });
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

    if (!(await canAccess(userId, initiativeId)).ok) {
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

    const actions = extracted.map((t) => {
      let dueDate: string | null = null;
      if (t.dueDate) {
        const d = new Date(t.dueDate);
        dueDate = isNaN(d.getTime()) ? null : t.dueDate;
      }
      return {
        title: t.title,
        description: t.description ?? null,
        priority: t.priority,
        dueDate,
        assigneeId: t.assigneeIds[0] ?? null,
        sourceType: 'transcript',
        tags: t.tags,
      };
    });

    return res.json({ actions, count: actions.length });
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
};

// Per-user cache: only call AI once per day (resets at midnight or on manual refresh)
const briefCache = new Map<string, { brief: string; date: string }>();

export const getExecutiveBrief = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const forceRefresh = req.query.refresh === 'true';
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Return cached brief if same day and not a forced refresh
    const cached = briefCache.get(userId);
    if (!forceRefresh && cached && cached.date === today) {
      return res.json({ brief: cached.brief });
    }

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

    briefCache.set(userId, { brief: brief as any, date: today });
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

    const actions = extracted.map((t) => {
      // Guard against non-parseable date strings from Gemini (e.g. "next week")
      let dueDate: string | null = null;
      if (t.dueDate) {
        const d = new Date(t.dueDate);
        dueDate = isNaN(d.getTime()) ? null : t.dueDate;
      }
      return {
        title: t.title,
        description: t.description ?? null,
        priority: t.priority,
        dueDate,
        tags: t.tags,
      };
    });

    return res.json({ actions, count: actions.length });
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
};

export const updateActionUpdate = async (req: AuthRequest, res: Response) => {
  try {
    const { updateId } = req.params;
    const userId = req.user!.id;
    const { content } = req.body as { content: string };

    if (!content?.trim()) return res.status(400).json({ error: 'Content is required' });

    const existing = await (prisma.actionUpdate as any).findUnique({ where: { id: updateId } });
    if (!existing) return res.status(404).json({ error: 'Update not found' });
    if (existing.userId !== userId) return res.status(403).json({ error: 'You can only edit your own updates' });

    const updated = await (prisma.actionUpdate as any).update({
      where: { id: updateId },
      data: { content: content.trim() },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });
    notifyMentions(content.trim(), userId, existing.actionId).catch(console.error);
    return res.json({ update: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
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

    const { ok: canView } = await canAccessAction(userId, action);
    if (!canView) {
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

    const { ok: canView } = await canAccessAction(userId, action);
    if (!canView) {
      return res.status(403).json({ error: 'Access denied' });
    }

    try {
      const update = await (prisma.actionUpdate as any).create({
        data: { actionId, userId, content: content.trim() },
        include: { user: { select: { id: true, name: true, avatar: true } } },
      });
      notifyMentions(content.trim(), userId, actionId).catch(console.error);

      // Notify action creator and assignee about new comment (skip the commenter)
      const notifyIds = new Set<string>();
      if (action.createdBy !== userId) notifyIds.add(action.createdBy);
      if (action.assigneeId && action.assigneeId !== userId) notifyIds.add(action.assigneeId);
      if (notifyIds.size) {
        const poster = update.user as { name: string };
        prisma.user
          .findMany({ where: { id: { in: [...notifyIds] }, pushNotificationsEnabled: true }, select: { id: true } })
          .then((users) =>
            users.forEach((u) =>
              sendPushNotification(u.id, {
                title: `${poster.name} commented`,
                body: content.trim().slice(0, 100),
                url: action.initiativeId ? `/initiatives/${action.initiativeId}` : '/command-center',
                tag: `comment-${actionId}`,
              }).catch((err) => console.error('[push] comment push failed:', err))
            )
          )
          .catch(console.error);
      }

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
