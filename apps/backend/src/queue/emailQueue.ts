import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { sendEmail } from '../services/emailService';
import { sendPushNotification, sendPushToAll } from '../services/pushService';
import { generateDailyDigestReport, DigestAction } from '../services/AIService';

const prisma = new PrismaClient();

// Returns "YYYY-MM-DD" in the given IANA timezone (en-CA locale gives this format natively)
function getTodayInTz(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

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

  // ── Initiative Daily Digest — every minute, respects creator's timezone ──
  cron.schedule('* * * * *', async () => {
    try {
      const initiatives = await prisma.initiativeSettings.findMany({
        where: { dailyReportEnabled: true },
        select: {
          initiativeId: true,
          dailyReportTime: true,
          dailyReportEmails: true,
          lastDigestSentDate: true,
          initiative: {
            select: { creator: { select: { timezone: true } } },
          },
        },
      });

      const now = new Date();

      for (const setting of initiatives) {
        const tz = setting.initiative.creator.timezone || 'UTC';
        const localTime = new Intl.DateTimeFormat('en-GB', {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(now);

        console.log(`[digest-cron] initiative=${setting.initiativeId} localTime="${localTime}" scheduled="${setting.dailyReportTime}" configuredEmails=${setting.dailyReportEmails.length} lastSent=${setting.lastDigestSentDate ?? 'never'} tz=${tz}`);

        if (localTime !== setting.dailyReportTime) continue;

        // Pre-filter: skip if already sent today
        const todayStr = getTodayInTz(tz);
        if (setting.lastDigestSentDate === todayStr) continue;

        console.log(`[digest-cron] TIME MATCHED — firing digest for ${setting.initiativeId}`);
        sendInitiativeDailyDigest(setting.initiativeId).catch((err) =>
          console.error('[cron] Daily digest failed for', setting.initiativeId, err)
        );
      }
    } catch (err) {
      console.error('[cron] Daily digest scheduler error:', err);
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
  console.log(`[digest] sendInitiativeDailyDigest called for ${initiativeId}`);
  try {
    const settings = await prisma.initiativeSettings.findUnique({
      where: { initiativeId },
      include: {
        initiative: {
          include: {
            creator: { select: { timezone: true } },
            actions: {
              include: { assignee: { select: { name: true } } },
            },
          },
        },
      },
    });

    if (!settings?.dailyReportEnabled) {
      console.log(`[digest] skipping — disabled`);
      return;
    }

    // Always send to all initiative members (including owner)
    const members = await prisma.initiativeMember.findMany({
      where: { initiativeId },
      include: { user: { select: { email: true } } },
    });
    const recipientEmails = members.map((m) => m.user.email);

    console.log(`[digest] recipients: ${JSON.stringify(recipientEmails)}`);
    if (!recipientEmails.length) {
      console.log(`[digest] skipping — no members found`);
      return;
    }

    // ── Idempotency guard — never send twice on the same day ─────────────────
    const tz = settings.initiative.creator.timezone || 'UTC';
    const todayStr = getTodayInTz(tz);
    if (settings.lastDigestSentDate === todayStr) {
      console.log(`[digest] Already sent today (${todayStr}) for initiative ${initiativeId}, skipping`);
      return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    const { initiative } = settings;
    const now = new Date();

    // Build structured action data for AI
    const digestActions: DigestAction[] = initiative.actions.map((a) => {
      const updatedAt = new Date((a as any).updatedAt || now);
      const daysSinceUpdate = Math.floor((now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));
      return {
        actionNumber: (a as any).actionNumber ?? null,
        title: a.title,
        status: a.status,
        priority: a.priority,
        assigneeName: a.assignee?.name || null,
        dueDate: a.dueDate ? new Date(a.dueDate).toISOString().split('T')[0] : null,
        isOverdue: !!a.dueDate && new Date(a.dueDate) < now && a.status !== 'completed',
        daysSinceUpdate,
      };
    });

    const total = digestActions.length;
    const completedCount = digestActions.filter((a) => a.status === 'completed').length;
    const inProgressList = digestActions.filter((a) => a.status === 'in-progress');
    const overdueList = digestActions.filter((a) => a.isOverdue);
    const staleList = digestActions.filter((a) => a.daysSinceUpdate >= 3 && a.status !== 'completed');
    const todoList = digestActions.filter((a) => a.status === 'todo');
    const completedList = digestActions.filter((a) => a.status === 'completed');
    const progress = total > 0 ? Math.round((completedCount / total) * 100) : 0;
    const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const PRIORITY_COLOR: Record<string, string> = { urgent: '#dc2626', high: '#f97316', medium: '#eab308', low: '#6b7280' };

    const actionRow = (a: DigestAction) => `
      <tr>
        <td style="padding:8px 12px; border-bottom:1px solid #f3f4f6;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${PRIORITY_COLOR[a.priority] || '#6b7280'};margin-right:8px;vertical-align:middle;"></span>
          ${a.actionNumber != null ? `<span style="font-size:10px;font-family:monospace;font-weight:600;color:#9ca3af;background:#f3f4f6;padding:1px 5px;border-radius:4px;margin-right:6px;">A-${String(a.actionNumber).padStart(5, '0')}</span>` : ''}
          <span style="font-size:13px;color:#111827;">${a.title}</span>
          ${a.isOverdue ? '<span style="margin-left:6px;font-size:10px;font-weight:700;color:#fff;background:#dc2626;padding:1px 6px;border-radius:10px;">OVERDUE</span>' : ''}
          ${a.daysSinceUpdate >= 3 && a.status !== 'completed' ? `<span style="margin-left:6px;font-size:10px;font-weight:700;color:#fff;background:#f97316;padding:1px 6px;border-radius:10px;">STALE ${a.daysSinceUpdate}d</span>` : ''}
        </td>
        <td style="padding:8px 12px; border-bottom:1px solid #f3f4f6; font-size:12px; color:#6b7280; white-space:nowrap;">${a.assigneeName || 'Unassigned'}</td>
        <td style="padding:8px 12px; border-bottom:1px solid #f3f4f6; font-size:12px; color:${a.isOverdue ? '#dc2626' : '#6b7280'}; white-space:nowrap;">${a.dueDate || '—'}</td>
      </tr>`;

    const section = (title: string, color: string, icon: string, rows: DigestAction[], emptyMsg: string) => rows.length === 0 ? '' : `
      <div style="margin-bottom:24px;">
        <div style="background:${color}; padding:8px 14px; border-radius:8px 8px 0 0; display:flex; align-items:center; gap:8px;">
          <span style="font-size:15px;">${icon}</span>
          <span style="font-size:13px; font-weight:700; color:#fff;">${title}</span>
          <span style="margin-left:auto; background:rgba(255,255,255,0.25); color:#fff; font-size:11px; font-weight:700; padding:1px 8px; border-radius:10px;">${rows.length}</span>
        </div>
        <table style="width:100%; border-collapse:collapse; background:#fff; border:1px solid #e5e7eb; border-top:none; border-radius:0 0 8px 8px; overflow:hidden;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:6px 12px; font-size:11px; font-weight:600; color:#9ca3af; text-align:left;">Action</th>
              <th style="padding:6px 12px; font-size:11px; font-weight:600; color:#9ca3af; text-align:left; white-space:nowrap;">Assignee</th>
              <th style="padding:6px 12px; font-size:11px; font-weight:600; color:#9ca3af; text-align:left; white-space:nowrap;">Due</th>
            </tr>
          </thead>
          <tbody>${rows.map(actionRow).join('')}</tbody>
        </table>
      </div>`;

    console.log(`[digest] generating AI insights for ${initiative.title}`);
    const aiInsight = await generateDailyDigestReport(initiative.title, digestActions);

    const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:660px;margin:0 auto;background:#f9fafb;padding:24px;">

      <!-- Header -->
      <div style="background:linear-gradient(135deg,#4648d4,#6366f1);border-radius:12px;padding:24px 28px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:12px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1px;">Daily Initiative Report</p>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#fff;">${initiative.title}</h1>
        <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.75);">${dateStr}</p>
      </div>

      <!-- Metric Cards -->
      <table style="width:100%;border-collapse:separate;border-spacing:8px;margin-bottom:12px;">
        <tr>
          <td style="background:#fff;border-radius:10px;padding:14px 16px;text-align:center;border:1px solid #e5e7eb;width:20%;">
            <div style="font-size:24px;font-weight:700;color:#111827;">${total}</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:2px;">Total</div>
          </td>
          <td style="background:#fff;border-radius:10px;padding:14px 16px;text-align:center;border:1px solid #e5e7eb;width:20%;">
            <div style="font-size:24px;font-weight:700;color:#16a34a;">${completedCount}</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:2px;">Done</div>
          </td>
          <td style="background:#fff;border-radius:10px;padding:14px 16px;text-align:center;border:1px solid #e5e7eb;width:20%;">
            <div style="font-size:24px;font-weight:700;color:#4648d4;">${inProgressList.length}</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:2px;">In Progress</div>
          </td>
          <td style="background:#fff;border-radius:10px;padding:14px 16px;text-align:center;border:1px solid #e5e7eb;width:20%;">
            <div style="font-size:24px;font-weight:700;color:#dc2626;">${overdueList.length}</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:2px;">Overdue</div>
          </td>
          <td style="background:#fff;border-radius:10px;padding:14px 16px;text-align:center;border:1px solid #e5e7eb;width:20%;">
            <div style="font-size:24px;font-weight:700;color:#f97316;">${staleList.length}</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:2px;">Stale</div>
          </td>
        </tr>
      </table>

      <!-- Progress Bar -->
      <div style="background:#fff;border-radius:10px;padding:16px 20px;margin-bottom:20px;border:1px solid #e5e7eb;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:13px;font-weight:600;color:#374151;">Overall Progress</span>
          <span style="font-size:13px;font-weight:700;color:#4648d4;">${progress}%</span>
        </div>
        <div style="background:#e5e7eb;border-radius:99px;height:10px;overflow:hidden;">
          <div style="background:linear-gradient(90deg,#4648d4,#818cf8);height:100%;width:${progress}%;border-radius:99px;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;">
          <span style="font-size:11px;color:#9ca3af;">${completedCount} of ${total} completed</span>
          <span style="font-size:11px;color:#9ca3af;">${total - completedCount} remaining</span>
        </div>
      </div>

      <!-- AI Insight -->
      <div style="background:#ede9fe;border-left:4px solid #4648d4;border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#4648d4;text-transform:uppercase;letter-spacing:0.5px;">AI Insight</p>
        <p style="margin:0;font-size:13px;color:#1e1b4b;line-height:1.6;">${aiInsight}</p>
      </div>

      <!-- Sections -->
      ${overdueList.length > 0 || staleList.length > 0 ? section('Needs Attention', '#dc2626', '🔴', [...overdueList, ...staleList.filter(a => !a.isOverdue)], '') : ''}
      ${section('In Progress', '#4648d4', '🔵', inProgressList, '')}
      ${section('Not Started', '#6b7280', '⚪', todoList, '')}
      ${section('Completed', '#16a34a', '✅', completedList, '')}

      <!-- Footer -->
      <div style="text-align:center;margin-top:24px;">
        <a href="${process.env.APP_URL}/initiatives/${initiativeId}" style="background:#4648d4;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;display:inline-block;font-size:14px;font-weight:600;">
          View Initiative →
        </a>
        <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;">You're receiving this because you're a member of this initiative.</p>
      </div>

    </div>`;

    for (const email of recipientEmails) {
      await sendEmail({
        to: email,
        subject: `Daily Report: ${initiative.title}`,
        html,
      });
    }

    // Stamp the date so we never double-send today
    await prisma.initiativeSettings.update({
      where: { initiativeId },
      data: { lastDigestSentDate: todayStr },
    });

    console.log(`[digest] Sent and stamped for initiative ${initiativeId} (${todayStr})`);
  } catch (err) {
    console.error('Daily digest failed for initiative', initiativeId, err);
    // No stamp on error — allows retry on next cron tick
  }
};

// Called on server start — fires digests that were missed while the server was down
export const checkMissedDigests = async (): Promise<void> => {
  console.log('[startup] Checking for missed daily digests...');
  try {
    const initiatives = await prisma.initiativeSettings.findMany({
      where: { dailyReportEnabled: true },
      select: {
        initiativeId: true,
        dailyReportTime: true,
        lastDigestSentDate: true,
        initiative: {
          select: { creator: { select: { timezone: true } } },
        },
      },
    });

    const now = new Date();

    for (const setting of initiatives) {
      const tz = setting.initiative.creator.timezone || 'UTC';
      const todayStr = getTodayInTz(tz);

      // Skip if already sent today
      if (setting.lastDigestSentDate === todayStr) continue;

      // Parse scheduled HH:MM
      const [scheduledHour, scheduledMinute] = setting.dailyReportTime.split(':').map(Number);
      if (isNaN(scheduledHour) || isNaN(scheduledMinute)) continue;

      // Get current hour + minute in creator's timezone
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(now);

      const currentHour = parseInt(parts.find((p) => p.type === 'hour')!.value, 10);
      const currentMinute = parseInt(parts.find((p) => p.type === 'minute')!.value, 10);

      const currentTotal = currentHour * 60 + currentMinute;
      const scheduledTotal = scheduledHour * 60 + scheduledMinute;

      if (currentTotal >= scheduledTotal) {
        console.log(`[startup] Missed digest for ${setting.initiativeId} (scheduled ${setting.dailyReportTime} ${tz}), firing now`);
        sendInitiativeDailyDigest(setting.initiativeId).catch((err) =>
          console.error('[startup] Missed digest failed for', setting.initiativeId, err)
        );
      }
    }
  } catch (err) {
    console.error('[startup] checkMissedDigests error:', err);
  }
};
