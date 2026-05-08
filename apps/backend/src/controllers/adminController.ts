import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { isSuperAdmin } from '../middleware/superAdmin';
import { logAudit } from '../services/auditService';

const prisma = new PrismaClient();

// ── Admin: list all users with feature flags ──────────────────────────────────

export const listUsers = async (req: AuthRequest, res: Response) => {
  try {
    const search = (req.query.search as string | undefined)?.trim();
    const users = await prisma.user.findMany({
      where: search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      } : undefined,
      select: {
        id: true, name: true, email: true, role: true, avatar: true,
        emailVerified: true, createdAt: true,
        featureFlags: { select: { feature: true, enabled: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ── Admin: toggle feature flag for a user ────────────────────────────────────

const featureFlagSchema = z.object({
  feature: z.string().min(1),
  enabled: z.boolean(),
});

export const updateUserFeature = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { feature, enabled } = featureFlagSchema.parse(req.body);

    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const flag = await (prisma.userFeatureFlag as any).upsert({
      where: { userId_feature: { userId, feature } },
      update: { enabled },
      create: { userId, feature, enabled },
    });

    logAudit({
      userId: req.user!.id,
      action: 'admin.feature_flag_updated',
      entityType: 'user',
      entityId: userId,
      entityTitle: targetUser.name,
      metadata: { feature, enabled },
      req,
    });

    res.json({ flag });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ── Admin: system-wide stats ─────────────────────────────────────────────────

export const getAdminStats = async (req: AuthRequest, res: Response) => {
  try {
    const [userCount, initiativeCount, actionCount] = await Promise.all([
      prisma.user.count(),
      prisma.initiative.count(),
      prisma.action.count(),
    ]);
    res.json({ users: userCount, initiatives: initiativeCount, actions: actionCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ── ELT: access guard helper ─────────────────────────────────────────────────

async function assertEltAccess(req: AuthRequest): Promise<boolean> {
  if (isSuperAdmin(req)) return true;
  const userId = req.user!.id;
  const flag = await (prisma.userFeatureFlag as any).findUnique({
    where: { userId_feature: { userId, feature: 'elt_dashboard' } },
  });
  return flag?.enabled === true;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// ── ELT: cross-org summary (super-admin OR elt_dashboard flag) ────────────────

export const getEltSummary = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await assertEltAccess(req))) {
      return res.status(403).json({ error: 'ELT Dashboard access not enabled' });
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      initiatives,
      totalActions,
      openActionsCount,
      overdueActionsCount,
      completedActionsCount,
      topOverdue,
      statusGroups,
      priorityGroups,
      completedByInitiative,
      overdueByInitiative,
      overdueByPriorityPerInitiative,
      staleActions,
      longRunningActions,
      usersWithActions,
      unassignedHighPriority,
      dueSoon,
      completedWithDue,
      onTimeResult,
    ] = await Promise.all([
      prisma.initiative.findMany({
        select: {
          id: true, title: true, status: true, priority: true, progress: true, dueDate: true, createdAt: true,
          creator: { select: { id: true, name: true, avatar: true } },
          _count: { select: { actions: true, members: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.action.count(),
      prisma.action.count({ where: { status: { notIn: ['completed'] } } }),
      prisma.action.count({ where: { dueDate: { lt: now }, status: { notIn: ['completed'] } } }),
      prisma.action.count({ where: { status: 'completed' } }),
      // Top 20 overdue
      prisma.action.findMany({
        where: { dueDate: { lt: now }, status: { notIn: ['completed'] } },
        include: {
          initiative: { select: { id: true, title: true } },
          assignees: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        },
        orderBy: { dueDate: 'asc' },
        take: 20,
      }),
      // Status funnel
      prisma.action.groupBy({ by: ['status'], _count: { id: true } }),
      // Priority distribution (open actions only)
      prisma.action.groupBy({
        by: ['priority'],
        where: { status: { notIn: ['completed'] } },
        _count: { id: true },
      }),
      // Completed counts per initiative
      prisma.action.groupBy({
        by: ['initiativeId'],
        where: { status: 'completed', initiativeId: { not: null } },
        _count: { id: true },
      }),
      // Overdue counts per initiative
      prisma.action.groupBy({
        by: ['initiativeId'],
        where: { dueDate: { lt: now }, status: { notIn: ['completed'] }, initiativeId: { not: null } },
        _count: { id: true },
      }),
      // Overdue by priority per initiative (for risk scoring)
      prisma.action.groupBy({
        by: ['initiativeId', 'priority'],
        where: { dueDate: { lt: now }, status: { notIn: ['completed'] }, initiativeId: { not: null } },
        _count: { id: true },
      }),
      // Stale actions: open, not updated in 14+ days
      prisma.action.findMany({
        where: { status: { notIn: ['completed'] }, updatedAt: { lt: fourteenDaysAgo } },
        include: {
          initiative: { select: { id: true, title: true } },
          assignees: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        },
        orderBy: { updatedAt: 'asc' },
        take: 20,
      }),
      // Long-running: oldest open actions
      prisma.action.findMany({
        where: { status: { notIn: ['completed'] } },
        include: {
          initiative: { select: { id: true, title: true } },
          assignees: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
      }),
      // Users with assigned actions (for workload)
      prisma.user.findMany({
        where: { assignedActions: { some: {} } },
        select: {
          id: true, name: true, avatar: true,
          initiativeMembers: { select: { department: true }, take: 1 },
          assignedActions: {
            select: {
              action: {
                select: { id: true, status: true, dueDate: true, createdAt: true, updatedAt: true },
              },
            },
          },
        },
      }),
      // Unassigned high-priority open actions
      prisma.action.count({
        where: { status: { notIn: ['completed'] }, priority: { in: ['urgent', 'high'] }, assignees: { none: {} } },
      }),
      // Due in next 7 days (not completed)
      prisma.action.count({
        where: { status: { notIn: ['completed'] }, dueDate: { gte: now, lte: sevenDaysFromNow } },
      }),
      // Total completed actions that have a due date (for on-time rate denominator)
      prisma.action.count({ where: { status: 'completed', dueDate: { not: null } } }),
      // On-time: completed before or on due date (raw SQL — self-referential date comparison)
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM "Action"
        WHERE status = 'completed' AND "dueDate" IS NOT NULL AND "updatedAt" <= "dueDate"
      `,
    ]);

    // ── Build maps ──────────────────────────────────────────────────────────────
    const completedMap = new Map(completedByInitiative.map((c) => [c.initiativeId!, c._count.id]));
    const overdueMap = new Map(overdueByInitiative.map((c) => [c.initiativeId!, c._count.id]));

    // Risk score: sum of priority-weighted overdue counts per initiative
    const PRIORITY_WEIGHT: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
    const riskScoreMap = new Map<string, number>();
    for (const row of overdueByPriorityPerInitiative) {
      const w = PRIORITY_WEIGHT[row.priority as string] ?? 1;
      riskScoreMap.set(row.initiativeId!, (riskScoreMap.get(row.initiativeId!) ?? 0) + w * row._count.id);
    }

    // On-time rate
    const onTimeCompleted = Number(onTimeResult[0]?.count ?? 0);
    const onTimeRate = completedWithDue > 0 ? Math.round((onTimeCompleted / completedWithDue) * 100) : null;

    const initiativeSummary = initiatives.map((init) => {
      const total = init._count.actions;
      const completed = completedMap.get(init.id) ?? 0;
      const overdue = overdueMap.get(init.id) ?? 0;
      const riskScore = riskScoreMap.get(init.id) ?? 0;
      return {
        id: init.id,
        title: init.title,
        status: init.status,
        priority: init.priority,
        progress: init.progress,
        dueDate: init.dueDate,
        createdAt: init.createdAt,
        ownerName: init.creator.name,
        ownerAvatar: init.creator.avatar,
        memberCount: init._count.members,
        actionCount: total,
        completedCount: completed,
        openCount: total - completed,
        overdueCount: overdue,
        riskScore,
      };
    });

    // ── Status funnel ───────────────────────────────────────────────────────────
    const statusFunnel: Record<string, number> = { todo: 0, 'in-progress': 0, 'in-review': 0, completed: 0 };
    for (const sg of statusGroups) statusFunnel[sg.status] = (statusFunnel[sg.status] ?? 0) + sg._count.id;

    // ── Priority distribution ───────────────────────────────────────────────────
    const priorityDistribution: Record<string, number> = { urgent: 0, high: 0, medium: 0, low: 0 };
    for (const pg of priorityGroups) priorityDistribution[pg.priority] = (priorityDistribution[pg.priority] ?? 0) + pg._count.id;

    // ── Member workload ─────────────────────────────────────────────────────────
    const memberWorkload = usersWithActions.map((u) => {
      const actions = u.assignedActions.map((aa) => aa.action);
      const open = actions.filter((a) => a.status !== 'completed');
      const overdue = open.filter((a) => a.dueDate && new Date(a.dueDate) < now);
      const completed = actions.filter((a) => a.status === 'completed');
      const stale = open.filter((a) => new Date(a.updatedAt) < sevenDaysAgo);
      const avgAgeDays = open.length > 0
        ? Math.round(open.reduce((sum, a) => sum + daysBetween(new Date(a.createdAt), now), 0) / open.length)
        : 0;
      return {
        id: u.id,
        name: u.name,
        avatar: u.avatar,
        department: u.initiativeMembers[0]?.department ?? null,
        assigned: actions.length,
        open: open.length,
        overdue: overdue.length,
        completed: completed.length,
        avgAgeDays,
        staleCount: stale.length,
      };
    }).sort((a, b) => b.overdue - a.overdue || b.open - a.open);

    // ── Shape action lists ──────────────────────────────────────────────────────
    const shapeAction = (a: any) => ({
      id: a.id,
      title: a.title,
      status: a.status,
      priority: a.priority,
      dueDate: a.dueDate,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      ageDays: daysBetween(new Date(a.createdAt), now),
      daysSinceUpdate: daysBetween(new Date(a.updatedAt), now),
      initiative: a.initiative,
      assignees: a.assignees.map((aa: any) => ({ id: aa.user.id, name: aa.user.name, avatar: aa.user.avatar })),
    });

    res.json({
      initiatives: initiativeSummary,
      actionCounts: {
        total: totalActions,
        open: openActionsCount,
        overdue: overdueActionsCount,
        completed: completedActionsCount,
      },
      overdueActions: topOverdue.map(shapeAction),
      statusFunnel,
      priorityDistribution,
      memberWorkload,
      staleActions: staleActions.map(shapeAction),
      longRunningActions: longRunningActions.map(shapeAction),
      onTimeRate,
      unassignedHighPriority,
      dueSoon,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ── ELT: per-user workload detail ────────────────────────────────────────────

export const getEltUserWorkload = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await assertEltAccess(req))) {
      return res.status(403).json({ error: 'ELT Dashboard access not enabled' });
    }

    const { userId } = req.params;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [user, assigneeRows] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, avatar: true, email: true },
      }),
      (prisma.actionAssignee as any).findMany({
        where: { userId },
        include: {
          action: {
            include: {
              initiative: { select: { id: true, title: true } },
              assignees: { include: { user: { select: { id: true, name: true, avatar: true } } } },
              tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
            },
          },
        },
      }),
    ]);

    if (!user) return res.status(404).json({ error: 'User not found' });

    const actions = assigneeRows.map((row: any) => {
      const a = row.action;
      const ageDays = daysBetween(new Date(a.createdAt), now);
      const daysSinceUpdate = daysBetween(new Date(a.updatedAt), now);
      const isStale = a.status !== 'completed' && new Date(a.updatedAt) < sevenDaysAgo;
      const isOverdue = !!a.dueDate && new Date(a.dueDate) < now && a.status !== 'completed';
      return {
        id: a.id,
        title: a.title,
        status: a.status,
        priority: a.priority,
        dueDate: a.dueDate,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        initiative: a.initiative,
        assignees: a.assignees.map((ax: any) => ({ id: ax.user.id, name: ax.user.name, avatar: ax.user.avatar })),
        tags: a.tags.map((at: any) => at.tag),
        ageDays,
        daysSinceUpdate,
        isStale,
        isOverdue,
      };
    });

    // Sort: overdue first, then by age desc
    actions.sort((a: any, b: any) => {
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      return b.ageDays - a.ageDays;
    });

    res.json({ user, actions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
