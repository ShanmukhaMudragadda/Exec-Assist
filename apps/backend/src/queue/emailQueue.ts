import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import {
  sendTaskAssignmentEmail,
  sendDailyReport,
  sendWorkspaceInvitationEmail,
  sendMentionNotificationEmail,
} from '../services/emailService';

const prisma = new PrismaClient();

// Fire-and-forget helpers — no queue, no Redis needed
export const queueTaskAssignmentEmail = async (
  assigneeEmail: string,
  assigneeName: string,
  taskTitle: string,
  taskId: string,
  workspaceId: string
): Promise<void> => {
  sendTaskAssignmentEmail(assigneeEmail, assigneeName, taskTitle, taskId, workspaceId)
    .catch((err) => console.error('Task assignment email failed:', err));
};

export const queueWorkspaceInvitationEmail = async (
  email: string,
  workspaceName: string,
  inviterName: string,
  invitationId: string
): Promise<void> => {
  sendWorkspaceInvitationEmail(email, workspaceName, inviterName, invitationId)
    .catch((err) => console.error('Invitation email failed:', err));
};

export const queueMentionNotification = async (
  mentionedEmail: string,
  mentionedName: string,
  mentionerName: string,
  taskTitle: string,
  taskId: string,
  workspaceId: string
): Promise<void> => {
  sendMentionNotificationEmail(mentionedEmail, mentionedName, mentionerName, taskTitle, taskId, workspaceId)
    .catch((err) => console.error('Mention notification email failed:', err));
};

const sendDailyReportForUser = async (userId: string): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.emailNotifications) return;

  const workspaceMembers = await prisma.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true, workspace: { select: { name: true } } },
  });
  const workspaceIds = workspaceMembers.map((m) => m.workspaceId);
  const workspaceNames: Record<string, string> = {};
  workspaceMembers.forEach((m) => { workspaceNames[m.workspaceId] = m.workspace.name; });

  const pendingTasks = await prisma.task.findMany({
    where: {
      workspaceId: { in: workspaceIds },
      OR: [
        { assignees: { some: { userId } } },
        { createdBy: userId },
      ],
      status: { not: 'completed' },
    },
    select: {
      id: true,
      title: true,
      priority: true,
      status: true,
      dueDate: true,
      category: true,
      tags: true,
      workspaceId: true,
      assignees: {
        select: { user: { select: { name: true } } },
      },
    },
    orderBy: [{ dueDate: 'asc' }, { priority: 'asc' }],
    take: 50,
  });

  if (pendingTasks.length > 0) {
    await sendDailyReport(
      user.email,
      user.name,
      pendingTasks.map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        category: t.category,
        tags: t.tags,
        workspaceId: t.workspaceId,
        workspaceName: workspaceNames[t.workspaceId] || '',
        assignees: t.assignees.map((a) => a.user.name),
      }))
    );
  }
};

function getLocalTime(tz: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now).replace(/\u202f/g, '');
  } catch {
    return `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
  }
}

// Run every minute — checks workspace daily report settings
export const scheduleDailyReports = (): void => {
  cron.schedule('* * * * *', async () => {
    const now = new Date();

    try {
      // Find workspaces with daily report enabled
      const workspaceSettings = await prisma.workspaceEmailSettings.findMany({
        where: { dailyReportEnabled: true },
        select: {
          workspaceId: true,
          dailyReportTime: true,
          workspace: {
            select: {
              members: {
                select: {
                  userId: true,
                  role: true,
                  user: { select: { timezone: true } },
                },
              },
            },
          },
        },
      });

      for (const ws of workspaceSettings) {
        // Use the owner's timezone for the workspace schedule
        const owner = ws.workspace.members.find((m) => m.role === 'owner');
        const tz = owner?.user?.timezone || 'UTC';
        const localTime = getLocalTime(tz, now);

        if (localTime !== ws.dailyReportTime) continue;

        // Send report to each member who has email notifications enabled
        for (const member of ws.workspace.members) {
          sendDailyReportForUser(member.userId).catch((err) =>
            console.error(`Daily report failed for user ${member.userId}:`, err)
          );
        }
      }
    } catch (err) {
      console.error('Daily report scheduler error:', err);
    }
  });

  console.log('Daily report scheduler started (node-cron, no Redis required)');
};
