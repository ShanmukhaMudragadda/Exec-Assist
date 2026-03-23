import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { AuthRequest } from '../middleware/auth';
import { CreateWorkspaceSchema, InvitationSchema } from '../utils/validators';
import { queueWorkspaceInvitationEmail } from '../queue/emailQueue'
import { sendWorkspaceAddedEmail, sendNewUserAddedEmail } from '../services/emailService';

const prisma = new PrismaClient();

export const createWorkspace = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = CreateWorkspaceSchema.parse(req.body);
    const userId = req.user!.id;

    const workspace = await prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.create({
        data: { ...data, createdBy: userId },
      });

      await tx.workspaceMember.create({
        data: { userId, workspaceId: ws.id, role: 'owner' },
      });

      return ws;
    });

    res.status(201).json({ workspace });
  } catch (error) {
    console.error('Create workspace error:', error);
    res.status(500).json({ error: 'Failed to create workspace' });
  }
};

export const listWorkspaces = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const memberships = await prisma.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: {
          include: {
            _count: { select: { members: true, tasks: true } },
          },
        },
      },
    });

    const workspaces = memberships.map((m) => ({
      ...m.workspace,
      memberRole: m.role,
    }));

    res.json({ workspaces });
  } catch (error) {
    console.error('List workspaces error:', error);
    res.status(500).json({ error: 'Failed to list workspaces' });
  }
};

export const getWorkspace = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: id } },
    });

    if (!member) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, avatar: true, emailVerified: true } },
          },
        },
        _count: { select: { tasks: true } },
      },
    });

    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    res.json({ workspace: { ...workspace, memberRole: member.role } });
  } catch (error) {
    console.error('Get workspace error:', error);
    res.status(500).json({ error: 'Failed to get workspace' });
  }
};

export const updateWorkspace = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: id } },
    });

    if (!member || !['owner', 'admin'].includes(member.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const data = CreateWorkspaceSchema.partial().parse(req.body);
    const workspace = await prisma.workspace.update({ where: { id }, data });

    res.json({ workspace });
  } catch (error) {
    console.error('Update workspace error:', error);
    res.status(500).json({ error: 'Failed to update workspace' });
  }
};

export const deleteWorkspace = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: id } },
    });

    if (!member || member.role !== 'owner') {
      res.status(403).json({ error: 'Only the owner can delete a workspace' });
      return;
    }

    await prisma.workspace.delete({ where: { id } });
    res.json({ message: 'Workspace deleted' });
  } catch (error) {
    console.error('Delete workspace error:', error);
    res.status(500).json({ error: 'Failed to delete workspace' });
  }
};

export const getMembers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const isMember = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: id } },
    });
    if (!isMember) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: id },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true, emailVerified: true } },
      },
    });

    res.json({ members });
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ error: 'Failed to get members' });
  }
};

export const updateMemberRole = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id, userId: targetUserId } = req.params;
    const requesterId = req.user!.id;
    const { role, profile } = req.body as { role?: string; profile?: string };

    const requester = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: requesterId, workspaceId: id } },
    });

    if (!requester || !['owner', 'admin'].includes(requester.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const updated = await prisma.workspaceMember.update({
      where: { userId_workspaceId: { userId: targetUserId, workspaceId: id } },
      data: {
        ...(role !== undefined && { role }),
        ...(profile !== undefined && { profile: profile || null }),
      },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });

    res.json({ member: updated });
  } catch (error) {
    console.error('Update member role error:', error);
    res.status(500).json({ error: 'Failed to update member role' });
  }
};

export const removeMember = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id, userId: targetUserId } = req.params;
    const requesterId = req.user!.id;

    const requester = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: requesterId, workspaceId: id } },
    });

    // Can remove self (leave) or admin/owner can remove others
    const isSelf = requesterId === targetUserId;
    if (!isSelf && (!requester || !['owner', 'admin'].includes(requester.role))) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    await prisma.workspaceMember.delete({
      where: { userId_workspaceId: { userId: targetUserId, workspaceId: id } },
    });

    res.json({ message: 'Member removed' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
};

export const addMember = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const requesterId = req.user!.id
    const { email, role = 'member', profile } = req.body as { email: string; role?: string; profile?: string }

    const requester = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: requesterId, workspaceId: id } },
      include: { user: { select: { name: true } }, workspace: { select: { name: true } } },
    })

    if (!requester || !['owner', 'admin'].includes(requester.role)) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return
    }

    const targetUser = await prisma.user.findUnique({ where: { email } })

    if (!targetUser) {
      // No account yet — create a placeholder account (Google OAuth only, no password needed)
      const newUser = await prisma.user.create({
        data: {
          email,
          name: email.split('@')[0],
          password: crypto.randomBytes(32).toString('hex'), // unusable, login is Google OAuth only
          emailVerified: false,
        },
      })

      await prisma.workspaceMember.create({
        data: { userId: newUser.id, workspaceId: id, role, profile: profile || null },
      })

      await sendNewUserAddedEmail(
        email,
        requester.workspace.name,
        requester.user.name,
        id
      )

      res.status(201).json({ member: { userId: newUser.id, email, role }, message: 'User created and added to workspace.' })
      return
    }

    const existing = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: targetUser.id, workspaceId: id } },
    })
    if (existing) {
      res.status(409).json({ error: 'User is already a member of this workspace' })
      return
    }

    const member = await prisma.workspaceMember.create({
      data: { userId: targetUser.id, workspaceId: id, role, profile: profile || null },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    })

    await sendWorkspaceAddedEmail(
      targetUser.email,
      targetUser.name,
      requester.workspace.name,
      requester.user.name,
      id
    )

    res.status(201).json({ member })
  } catch (error) {
    console.error('Add member error:', error)
    res.status(500).json({ error: 'Failed to add member' })
  }
}

export const sendInvitation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const data = InvitationSchema.parse(req.body);

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: id } },
      include: { user: { select: { name: true } }, workspace: { select: { name: true } } },
    });

    if (!member || !['owner', 'admin'].includes(member.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const existing = await prisma.workspaceInvitation.findFirst({
      where: { email: data.email, workspaceId: id, status: 'pending' },
    });

    if (existing) {
      res.status(409).json({ error: 'Invitation already sent to this email' });
      return;
    }

    const invitation = await prisma.workspaceInvitation.create({
      data: {
        email: data.email,
        workspaceId: id,
        invitedBy: userId,
        profile: (req.body as { profile?: string }).profile || null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await queueWorkspaceInvitationEmail(
      data.email,
      member.workspace.name,
      member.user.name,
      invitation.id
    );

    res.status(201).json({ invitation });
  } catch (error) {
    console.error('Send invitation error:', error);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
};

export const acceptInvitation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { invitationId } = req.params;
    const userId = req.user!.id;
    const userEmail = req.user!.email;

    const invitation = await prisma.workspaceInvitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation || invitation.status !== 'pending' || invitation.expiresAt < new Date()) {
      res.status(400).json({ error: 'Invalid or expired invitation' });
      return;
    }

    if (invitation.email !== userEmail) {
      res.status(403).json({ error: 'This invitation is for a different email' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.workspaceInvitation.update({
        where: { id: invitationId },
        data: { status: 'accepted' },
      });

      const existing = await tx.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId, workspaceId: invitation.workspaceId } },
      });

      if (!existing) {
        await tx.workspaceMember.create({
          data: {
            userId,
            workspaceId: invitation.workspaceId,
            role: 'member',
            profile: invitation.profile || null,
          },
        });
      }
    });

    res.json({ message: 'Invitation accepted', workspaceId: invitation.workspaceId });
  } catch (error) {
    console.error('Accept invitation error:', error);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
};

export const rejectInvitation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { invitationId } = req.params;

    await prisma.workspaceInvitation.update({
      where: { id: invitationId },
      data: { status: 'rejected' },
    });

    res.json({ message: 'Invitation rejected' });
  } catch (error) {
    console.error('Reject invitation error:', error);
    res.status(500).json({ error: 'Failed to reject invitation' });
  }
};

export const getWorkspaceAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: id } },
    });
    if (!member) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const [total, completed, inProgress, overdue, byStatus, byPriority, tasksByTag] =
      await Promise.all([
        prisma.task.count({ where: { workspaceId: id } }),
        prisma.task.count({ where: { workspaceId: id, status: 'completed' } }),
        prisma.task.count({ where: { workspaceId: id, status: 'in-progress' } }),
        prisma.task.count({
          where: {
            workspaceId: id,
            status: { not: 'completed' },
            dueDate: { lt: new Date() },
          },
        }),
        prisma.task.groupBy({
          by: ['status'],
          where: { workspaceId: id },
          _count: { status: true },
        }),
        prisma.task.groupBy({
          by: ['priority'],
          where: { workspaceId: id },
          _count: { priority: true },
        }),
        prisma.task.findMany({
          where: { workspaceId: id },
          select: { tags: true },
        }),
      ]);

    // Count tasks per tag
    const tagCounts: Record<string, number> = {};
    tasksByTag.forEach((t) => {
      t.tags.forEach((tag) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    res.json({
      overview: {
        total,
        completed,
        inProgress,
        overdue,
        completionRate: total ? Math.round((completed / total) * 100) : 0,
      },
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.status })),
      byPriority: byPriority.map((p) => ({ priority: p.priority, count: p._count.priority })),
      byTag: Object.entries(tagCounts).map(([tag, count]) => ({ tag, count })),
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
};

export const getEmailSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: id } },
    });
    if (!member) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    let settings = await prisma.workspaceEmailSettings.findUnique({
      where: { workspaceId: id },
    });

    if (!settings) {
      settings = await prisma.workspaceEmailSettings.create({
        data: { workspaceId: id },
      });
    }

    res.json({ settings });
  } catch (error) {
    console.error('Get email settings error:', error);
    res.status(500).json({ error: 'Failed to get email settings' });
  }
};

export const updateEmailSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: id } },
    });

    if (!member || !['owner', 'admin'].includes(member.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const { notifyOnTaskCreate, notifyOnTaskAssign, notifyOnTaskComplete, notifyOnComment, notifyOnDueDate, dailyReportEnabled, dailyReportTime } = req.body as {
      notifyOnTaskCreate?: boolean;
      notifyOnTaskAssign?: boolean;
      notifyOnTaskComplete?: boolean;
      notifyOnComment?: boolean;
      notifyOnDueDate?: boolean;
      dailyReportEnabled?: boolean;
      dailyReportTime?: string;
    };

    const settings = await prisma.workspaceEmailSettings.upsert({
      where: { workspaceId: id },
      create: {
        workspaceId: id,
        notifyOnTaskCreate: notifyOnTaskCreate ?? true,
        notifyOnTaskAssign: notifyOnTaskAssign ?? true,
        notifyOnTaskComplete: notifyOnTaskComplete ?? true,
        notifyOnComment: notifyOnComment ?? true,
        notifyOnDueDate: notifyOnDueDate ?? true,
        dailyReportEnabled: dailyReportEnabled ?? false,
        dailyReportTime: dailyReportTime ?? '08:00',
      },
      update: {
        ...(notifyOnTaskCreate !== undefined && { notifyOnTaskCreate }),
        ...(notifyOnTaskAssign !== undefined && { notifyOnTaskAssign }),
        ...(notifyOnTaskComplete !== undefined && { notifyOnTaskComplete }),
        ...(notifyOnComment !== undefined && { notifyOnComment }),
        ...(notifyOnDueDate !== undefined && { notifyOnDueDate }),
        ...(dailyReportEnabled !== undefined && { dailyReportEnabled }),
        ...(dailyReportTime !== undefined && { dailyReportTime }),
      },
    });

    res.json({ settings });
  } catch (error) {
    console.error('Update email settings error:', error);
    res.status(500).json({ error: 'Failed to update email settings' });
  }
};
