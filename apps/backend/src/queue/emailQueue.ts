import { PrismaClient } from '@prisma/client';
import { sendEmail } from '../services/emailService';

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

// Send daily reports for all initiatives that have it enabled
export const scheduleDailyReports = (): void => {
  // Daily reports are initiative-level — scheduled via node-cron in a future expansion
  console.log('Daily report scheduler initialized');
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
