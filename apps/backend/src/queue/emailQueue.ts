import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { sendEmail } from '../services/emailService';
import { sendPushNotification, sendPushToAll } from '../services/pushService';

const prisma = new PrismaClient();

// Fire-and-forget action assignment email
export const queueActionAssignmentEmail = async (
  assigneeEmail: string,
  assigneeName: string,
  actionTitle: string,
  actionId: string,
  initiativeId: string
): Promise<void> => {
  const actionUrl = `${process.env.APP_URL}/initiatives/${initiativeId}`;
  sendEmail({
    to: assigneeEmail,
    subject: `Action assigned to you: ${actionTitle}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; max-width:600px; margin:0 auto;">
        <h2 style="color:#4648d4;">New Action Assigned</h2>
        <p>Hi ${assigneeName},</p>
        <p>You have been assigned a new action: <strong>${actionTitle}</strong></p>
        <a href="${actionUrl}" style="background:#4648d4; color:#fff; padding:10px 22px; border-radius:8px; text-decoration:none; display:inline-block; margin:12px 0;">
          View Action →
        </a>
      </div>
    `,
  }).catch((err) => console.error('Action assignment email failed:', err));
};

export const scheduleDailyReports = (): void => {
  console.log('Daily report scheduler initialized');

  // ── Morning Brief Push — every day at 08:00 UTC ──────────────────────────
  cron.schedule('0 8 * * *', async () => {
    console.log('[cron] Sending morning brief push notifications');
    try {
      await sendPushToAll(
        {
          title: 'Good morning — your brief is ready',
          body: "Check your executive brief for today's priorities.",
          url: '/dashboard',
          tag: 'morning-brief',
        },
        { onlyEnabled: true }
      );
    } catch (err) {
      console.error('[cron] Morning brief push failed:', err);
    }
  }, { timezone: 'UTC' });

  // ── Due-Date Reminder — every day at 07:00 UTC ───────────────────────────
  cron.schedule('0 7 * * *', async () => {
    console.log('[cron] Sending due-date reminder push notifications');
    try {
      const tomorrow = new Date();
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const start = new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(), 0, 0, 0));
      const end = new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(), 23, 59, 59));

      const dueTomorrow = await prisma.action.findMany({
        where: {
          dueDate: { gte: start, lte: end },
          status: { not: 'completed' },
          assigneeId: { not: null },
          assignee: { pushNotificationsEnabled: true },
        },
        select: { id: true, title: true, initiativeId: true, assigneeId: true },
      });

      for (const action of dueTomorrow) {
        if (!action.assigneeId) continue;
        await sendPushNotification(action.assigneeId, {
          title: 'Due Tomorrow',
          body: action.title,
          url: action.initiativeId
            ? `/initiatives/${action.initiativeId}`
            : '/command-center',
          tag: `due-tomorrow-${action.id}`,
        });
      }
    } catch (err) {
      console.error('[cron] Due-date reminder push failed:', err);
    }
  }, { timezone: 'UTC' });
};

// Send daily digest for a specific initiative to configured emails
export const sendInitiativeDailyDigest = async (initiativeId: string): Promise<void> => {
  try {
    const settings = await prisma.initiativeSettings.findUnique({
      where: { initiativeId },
      include: {
        initiative: {
          include: {
            actions: {
              where: { status: { not: 'completed' } },
              include: { assignee: { select: { name: true } } },
            },
          },
        },
      },
    });

    if (!settings?.dailyReportEnabled || !settings.dailyReportEmails.length) return;

    const { initiative } = settings;
    const overdue = initiative.actions.filter((a) => a.dueDate && new Date(a.dueDate) < new Date());

    for (const email of settings.dailyReportEmails) {
      await sendEmail({
        to: email,
        subject: `Daily Report: ${initiative.title}`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; max-width:600px; margin:0 auto; padding:24px;">
            <h2 style="color:#4648d4;">${initiative.title} — Daily Report</h2>
            <p>${initiative.actions.length} open action(s), ${overdue.length} overdue.</p>
            ${overdue.length > 0 ? `<p style="color:#dc2626;"><strong>Overdue:</strong> ${overdue.map((a) => a.title).join(', ')}</p>` : ''}
            <a href="${process.env.APP_URL}/initiatives/${initiativeId}" style="background:#4648d4; color:#fff; padding:10px 22px; border-radius:8px; text-decoration:none; display:inline-block; margin:12px 0;">
              View Initiative →
            </a>
          </div>
        `,
      });
    }
  } catch (err) {
    console.error('Daily digest failed for initiative', initiativeId, err);
  }
};
