import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export const sendEmail = async (options: EmailOptions): Promise<void> => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@executive-tool.com',
      ...options,
    });
  } catch (error) {
    console.error('Error sending email:', error);
    // Don't throw - email failures shouldn't break the app
  }
};

export const sendWelcomeEmail = async (email: string, name: string, token: string): Promise<void> => {
  const verifyUrl = `${process.env.APP_URL}/auth/verify-email?token=${token}`;
  await sendEmail({
    to: email,
    subject: 'Welcome to Executive Management Tool - Verify Your Email',
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #6366f1;">Welcome, ${name}!</h1>
        <p>Thank you for joining Executive Management Tool. Please verify your email address to get started.</p>
        <a href="${verifyUrl}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; margin: 16px 0;">
          Verify Email
        </a>
        <p style="color: #6b7280; font-size: 14px;">This link expires in 24 hours. If you didn't create an account, ignore this email.</p>
      </div>
    `,
  });
};

export const sendPasswordResetEmail = async (email: string, token: string): Promise<void> => {
  const resetUrl = `${process.env.APP_URL}/auth/reset-password?token=${token}`;
  await sendEmail({
    to: email,
    subject: 'Reset Your Password - Executive Management Tool',
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #6366f1;">Reset Your Password</h1>
        <p>You requested a password reset. Click the button below to create a new password.</p>
        <a href="${resetUrl}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; margin: 16px 0;">
          Reset Password
        </a>
        <p style="color: #6b7280; font-size: 14px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
};

export const sendTaskAssignmentEmail = async (
  assigneeEmail: string,
  assigneeName: string,
  taskTitle: string,
  taskId: string,
  workspaceId: string
): Promise<void> => {
  const taskUrl = `${process.env.APP_URL}/workspace/${workspaceId}/tasks/${taskId}`;
  await sendEmail({
    to: assigneeEmail,
    subject: `New Task Assigned: ${taskTitle}`,
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #6366f1;">New Task Assigned to You</h1>
        <p>Hi ${assigneeName},</p>
        <p>You have been assigned a new task:</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <strong>${taskTitle}</strong>
        </div>
        <a href="${taskUrl}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; margin: 16px 0;">
          View Task
        </a>
      </div>
    `,
  });
};

export const sendWorkspaceAddedEmail = async (
  email: string,
  name: string,
  workspaceName: string,
  addedByName: string,
  workspaceId: string
): Promise<void> => {
  const workspaceUrl = `${process.env.APP_URL}/workspace/${workspaceId}`
  await sendEmail({
    to: email,
    subject: `You've been added to ${workspaceName} on EAssist`,
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #6366f1;">You've been added to a workspace!</h1>
        <p>Hi ${name},</p>
        <p><strong>${addedByName}</strong> has added you to the workspace <strong>${workspaceName}</strong> on EAssist.</p>
        <p>You can now access the workspace and start collaborating on tasks.</p>
        <a href="${workspaceUrl}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; margin: 16px 0;">
          View Workspace
        </a>
        <p style="color: #6b7280; font-size: 14px;">If you have any questions, reach out to ${addedByName}.</p>
      </div>
    `,
  })
}

export const sendNewUserAddedEmail = async (
  email: string,
  workspaceName: string,
  addedByName: string,
  workspaceId: string
): Promise<void> => {
  const loginUrl = `${process.env.APP_URL}/auth/login`;
  await sendEmail({
    to: email,
    subject: `You've been added to ${workspaceName} on EAssist`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; max-width:600px; margin:0 auto; background:#f9fafb; padding:24px;">
        <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6); border-radius:12px; padding:28px 32px; margin-bottom:24px; text-align:center;">
          <div style="font-size:32px; margin-bottom:8px;">🎉</div>
          <h1 style="margin:0; color:#ffffff; font-size:22px; font-weight:700;">You've been added to EAssist!</h1>
        </div>
        <div style="background:#ffffff; border:1px solid #e5e7eb; border-radius:10px; padding:24px; margin-bottom:16px;">
          <p style="margin:0 0 12px; color:#374151; font-size:15px;">
            <strong>${addedByName}</strong> has added you to the workspace <strong>${workspaceName}</strong> on EAssist.
          </p>
          <p style="margin:0 0 20px; color:#6b7280; font-size:14px;">
            Sign in with your Google account (<strong>${email}</strong>) to access your workspace.
          </p>
          <a href="${loginUrl}" style="display:inline-block; background:#6366f1; color:#ffffff; text-decoration:none; padding:12px 28px; border-radius:8px; font-size:15px; font-weight:600;">
            Sign in with Google →
          </a>
        </div>
        <p style="color:#9ca3af; font-size:12px; text-align:center; margin:0;">You're receiving this because you were added to a workspace on EAssist.</p>
      </div>
    `,
  });
};

export const sendWorkspaceInvitationEmail = async (
  email: string,
  workspaceName: string,
  inviterName: string,
  invitationId: string
): Promise<void> => {
  const registerUrl = `${process.env.APP_URL}/auth/register`;
  await sendEmail({
    to: email,
    subject: `You've been invited to join ${workspaceName} on EAssist`,
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #6366f1;">You're Invited!</h1>
        <p><strong>${inviterName}</strong> has invited you to join <strong>${workspaceName}</strong> on EAssist.</p>
        <p>Create your free account using this email address (${email}) and you'll be automatically added to the workspace.</p>
        <a href="${registerUrl}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; margin: 16px 0;">
          Create Account &amp; Join Workspace
        </a>
        <p style="color: #6b7280; font-size: 14px;">Already have an account? <a href="${process.env.APP_URL}/auth/login" style="color: #6366f1;">Sign in</a> and you'll be added automatically.</p>
        <p style="color: #6b7280; font-size: 14px;">This invitation expires in 7 days.</p>
      </div>
    `,
  });
};

export const sendMentionNotificationEmail = async (
  mentionedEmail: string,
  mentionedName: string,
  mentionerName: string,
  taskTitle: string,
  taskId: string,
  workspaceId: string
): Promise<void> => {
  const taskUrl = `${process.env.APP_URL}/workspace/${workspaceId}/tasks/${taskId}`;
  await sendEmail({
    to: mentionedEmail,
    subject: `${mentionerName} mentioned you in "${taskTitle}"`,
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #6366f1;">You were mentioned</h1>
        <p>Hi ${mentionedName},</p>
        <p><strong>${mentionerName}</strong> mentioned you in a comment on task: <strong>${taskTitle}</strong></p>
        <a href="${taskUrl}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; margin: 16px 0;">
          View Task
        </a>
      </div>
    `,
  });
};

const PRIORITY_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  urgent: { bg: '#fee2e2', color: '#dc2626', label: '🔴 Urgent' },
  high:   { bg: '#ffedd5', color: '#ea580c', label: '🟠 High' },
  medium: { bg: '#fef9c3', color: '#ca8a04', label: '🟡 Medium' },
  low:    { bg: '#f1f5f9', color: '#64748b', label: '⚪ Low' },
};

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  'todo':        { bg: '#f1f5f9', color: '#475569', label: 'To Do' },
  'in-progress': { bg: '#dbeafe', color: '#1d4ed8', label: 'In Progress' },
  'in-review':   { bg: '#ede9fe', color: '#7c3aed', label: 'In Review' },
  'completed':   { bg: '#dcfce7', color: '#16a34a', label: 'Completed' },
};

export const sendDailyReport = async (
  userEmail: string,
  userName: string,
  tasks: Array<{
    title: string; priority: string; status: string; dueDate: string | null;
    category: string | null; tags: string[]; id: string; workspaceId: string;
    workspaceName: string; assignees: string[];
  }>
): Promise<void> => {
  const now = new Date();
  const today = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const overdue = tasks.filter((t) => t.dueDate && new Date(t.dueDate) < now);
  const dueToday = tasks.filter((t) => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    return d.toDateString() === now.toDateString();
  });
  const upcoming = tasks.filter((t) => {
    if (!t.dueDate) return true;
    return new Date(t.dueDate) > now && new Date(t.dueDate).toDateString() !== now.toDateString();
  });

  const renderTask = (task: typeof tasks[0]) => {
    const p = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
    const s = STATUS_STYLES[task.status] || STATUS_STYLES.todo;
    const taskUrl = `${process.env.APP_URL}/workspace/${task.workspaceId}/tasks/${task.id}`;
    const dueDateStr = task.dueDate
      ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null;
    const assigneeStr = task.assignees.length > 0 ? task.assignees.join(', ') : 'Unassigned';

    return `
      <div style="background:#ffffff; border:1px solid #e5e7eb; border-radius:10px; padding:16px; margin-bottom:10px;">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <a href="${taskUrl}" style="color:#111827; text-decoration:none; font-size:15px; font-weight:600; flex:1; min-width:0; line-height:1.4;">
            ${task.title}
          </a>
          <span style="background:${p.bg}; color:${p.color}; font-size:11px; font-weight:600; padding:3px 10px; border-radius:20px; white-space:nowrap;">${p.label}</span>
        </div>
        <div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
          <span style="background:${s.bg}; color:${s.color}; font-size:11px; font-weight:500; padding:2px 8px; border-radius:4px;">${s.label}</span>
          ${task.workspaceName ? `<span style="background:#f3f4f6; color:#6b7280; font-size:11px; padding:2px 8px; border-radius:4px;">📁 ${task.workspaceName}</span>` : ''}
          ${task.category ? `<span style="background:#eef2ff; color:#4f46e5; font-size:11px; padding:2px 8px; border-radius:4px;">${task.category}</span>` : ''}
          ${dueDateStr ? `<span style="background:#f0fdf4; color:#15803d; font-size:11px; padding:2px 8px; border-radius:4px;">📅 ${dueDateStr}</span>` : ''}
        </div>
        <div style="margin-top:8px; font-size:12px; color:#6b7280;">
          👤 ${assigneeStr}
        </div>
        ${task.tags.length > 0 ? `
        <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:4px;">
          ${task.tags.map((tag) => `<span style="background:#f9fafb; color:#6b7280; font-size:10px; padding:2px 6px; border-radius:4px; border:1px solid #e5e7eb;">#${tag}</span>`).join('')}
        </div>` : ''}
      </div>`;
  };

  const renderSection = (title: string, emoji: string, sectionTasks: typeof tasks, headerColor: string) => {
    if (sectionTasks.length === 0) return '';
    return `
      <div style="margin-bottom:28px;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
          <span style="font-size:16px;">${emoji}</span>
          <h2 style="margin:0; font-size:14px; font-weight:700; color:${headerColor}; text-transform:uppercase; letter-spacing:0.05em;">${title} (${sectionTasks.length})</h2>
        </div>
        ${sectionTasks.map(renderTask).join('')}
      </div>`;
  };

  await sendEmail({
    to: userEmail,
    subject: `📋 Daily Task Report — ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; max-width:640px; margin:0 auto; background:#f9fafb; padding:24px;">

        <!-- Header -->
        <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6); border-radius:12px; padding:28px 32px; margin-bottom:24px; text-align:center;">
          <div style="font-size:32px; margin-bottom:8px;">📋</div>
          <h1 style="margin:0; color:#ffffff; font-size:22px; font-weight:700;">Daily Task Report</h1>
          <p style="margin:6px 0 0; color:rgba(255,255,255,0.85); font-size:14px;">Hi ${userName} · ${today}</p>
        </div>

        <!-- Summary cards -->
        <div style="display:flex; gap:12px; margin-bottom:24px; flex-wrap:wrap;">
          <div style="flex:1; min-width:120px; background:#ffffff; border:1px solid #e5e7eb; border-radius:10px; padding:16px; text-align:center;">
            <div style="font-size:24px; font-weight:700; color:#111827;">${tasks.length}</div>
            <div style="font-size:12px; color:#6b7280; margin-top:2px;">Total Pending</div>
          </div>
          <div style="flex:1; min-width:120px; background:#fff1f2; border:1px solid #fecdd3; border-radius:10px; padding:16px; text-align:center;">
            <div style="font-size:24px; font-weight:700; color:#dc2626;">${overdue.length}</div>
            <div style="font-size:12px; color:#6b7280; margin-top:2px;">Overdue</div>
          </div>
          <div style="flex:1; min-width:120px; background:#fff7ed; border:1px solid #fed7aa; border-radius:10px; padding:16px; text-align:center;">
            <div style="font-size:24px; font-weight:700; color:#ea580c;">${dueToday.length}</div>
            <div style="font-size:12px; color:#6b7280; margin-top:2px;">Due Today</div>
          </div>
          <div style="flex:1; min-width:120px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:16px; text-align:center;">
            <div style="font-size:24px; font-weight:700; color:#16a34a;">${upcoming.length}</div>
            <div style="font-size:12px; color:#6b7280; margin-top:2px;">Upcoming</div>
          </div>
        </div>

        <!-- Task sections -->
        <div style="background:#f9fafb; padding:0;">
          ${renderSection('Overdue', '🚨', overdue, '#dc2626')}
          ${renderSection('Due Today', '⏰', dueToday, '#ea580c')}
          ${renderSection('Upcoming', '📌', upcoming, '#4f46e5')}
        </div>

        <!-- Footer -->
        <div style="text-align:center; padding-top:20px; border-top:1px solid #e5e7eb; margin-top:8px;">
          <a href="${process.env.APP_URL}" style="display:inline-block; background:#6366f1; color:#ffffff; text-decoration:none; padding:10px 24px; border-radius:8px; font-size:14px; font-weight:600; margin-bottom:16px;">
            Open EAssist →
          </a>
          <p style="color:#9ca3af; font-size:12px; margin:0;">You're receiving this because daily reports are enabled for your workspace.</p>
        </div>
      </div>
    `,
  });
};
