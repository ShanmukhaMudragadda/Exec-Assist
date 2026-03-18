import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
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
  const verifyUrl = `${process.env.FRONTEND_URL}/auth/verify-email?token=${token}`;
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
  const resetUrl = `${process.env.FRONTEND_URL}/auth/reset-password?token=${token}`;
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
  const taskUrl = `${process.env.FRONTEND_URL}/workspace/${workspaceId}/tasks/${taskId}`;
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

export const sendWorkspaceInvitationEmail = async (
  email: string,
  workspaceName: string,
  inviterName: string,
  invitationId: string
): Promise<void> => {
  const inviteUrl = `${process.env.FRONTEND_URL}/invitations/${invitationId}/accept`;
  await sendEmail({
    to: email,
    subject: `You're invited to join ${workspaceName}`,
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #6366f1;">Workspace Invitation</h1>
        <p>${inviterName} has invited you to join <strong>${workspaceName}</strong> on Executive Management Tool.</p>
        <a href="${inviteUrl}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; margin: 16px 0;">
          Accept Invitation
        </a>
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
  const taskUrl = `${process.env.FRONTEND_URL}/workspace/${workspaceId}/tasks/${taskId}`;
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

export const sendDailyReport = async (
  userEmail: string,
  userName: string,
  tasks: Array<{ title: string; priority: string; dueDate: string | null; category: string | null; tags: string[]; id: string; workspaceId: string }>
): Promise<void> => {
  const taskRows = tasks.map(task => `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 12px;">
        <a href="${process.env.FRONTEND_URL}/workspace/${task.workspaceId}/tasks/${task.id}" style="color: #6366f1; text-decoration: none;">${task.title}</a>
      </td>
      <td style="padding: 12px;">${task.priority}</td>
      <td style="padding: 12px;">${task.category || '-'}</td>
      <td style="padding: 12px;">${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '-'}</td>
    </tr>
  `).join('');

  await sendEmail({
    to: userEmail,
    subject: `Daily Task Report - ${new Date().toLocaleDateString()}`,
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 800px; margin: 0 auto;">
        <h1 style="color: #6366f1;">Daily Task Report</h1>
        <p>Hi ${userName}, here are your pending tasks for today:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="padding: 12px; text-align: left;">Task</th>
              <th style="padding: 12px; text-align: left;">Priority</th>
              <th style="padding: 12px; text-align: left;">Category</th>
              <th style="padding: 12px; text-align: left;">Due Date</th>
            </tr>
          </thead>
          <tbody>${taskRows}</tbody>
        </table>
        <p style="color: #6b7280; font-size: 14px;">Total pending tasks: ${tasks.length}</p>
      </div>
    `,
  });
};
