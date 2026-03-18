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
    select: { workspaceId: true },
  });
  const workspaceIds = workspaceMembers.map((m) => m.workspaceId);

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
      dueDate: true,
      category: true,
      tags: true,
      workspaceId: true,
    },
    orderBy: { dueDate: 'asc' },
    take: 50,
  });

  if (pendingTasks.length > 0) {
    await sendDailyReport(
      user.email,
      user.name,
      pendingTasks.map((t) => ({
        ...t,
        dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      }))
    );
  }
};

// Run every minute, check which users have their daily report time now
export const scheduleDailyReports = (): void => {
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    try {
      const users = await prisma.user.findMany({
        where: {
          emailNotifications: true,
          dailyReportTime: currentTime,
        },
        select: { id: true },
      });

      for (const user of users) {
        sendDailyReportForUser(user.id).catch((err) =>
          console.error(`Daily report failed for user ${user.id}:`, err)
        );
      }
    } catch (err) {
      console.error('Daily report scheduler error:', err);
    }
  });

  console.log('Daily report scheduler started (node-cron, no Redis required)');
};
