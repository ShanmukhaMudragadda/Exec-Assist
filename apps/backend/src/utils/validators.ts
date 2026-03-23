import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const CreateWorkspaceSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').max(100),
  description: z.string().max(500).optional(),
  icon: z.string().optional(),
});

// Accepts full ISO datetime or date-only string (e.g. "2026-03-25"), normalises to ISO
const dueDateSchema = z.string()
  .transform((val) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return `${val}T00:00:00.000Z`;
    return val;
  })
  .pipe(z.string().datetime())
  .optional()
  .nullable();

export const CreateTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().max(5000).optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),
  status: z.enum(['todo', 'in-progress', 'in-review', 'completed']).default('todo'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  dueDate: dueDateSchema,
  assigneeIds: z.array(z.string()).optional(),
});

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional().nullable(),
  category: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['todo', 'in-progress', 'in-review', 'completed']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  dueDate: dueDateSchema,
  assigneeIds: z.array(z.string()).optional(),
});

export const TranscriptTextSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(10).max(50000),
  type: z.enum(['meeting', 'voice_note', 'recording']),
});

export const InvitationSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'member']).default('member'),
});

export const TaskUpdateSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty').max(10000),
});

export const UpdateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  avatar: z.string().url().optional().nullable(),
  emailNotifications: z.boolean().optional(),
  dailyReportTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timezone: z.string().optional(),
});

export const ResetPasswordSchema = z.object({
  email: z.string().email(),
});

export const NewPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});
