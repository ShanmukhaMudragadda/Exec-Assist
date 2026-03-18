import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { CreateTaskSchema, UpdateTaskSchema, TaskUpdateSchema } from '../utils/validators';
import { queueTaskAssignmentEmail, queueMentionNotification } from '../queue/emailQueue';

const prisma = new PrismaClient();

export const createTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { workspaceId } = req.params;
    const userId = req.user!.id;

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    if (!member) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const data = CreateTaskSchema.parse(req.body);
    const { assigneeIds, ...taskData } = data;

    const task = await prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          ...taskData,
          workspaceId,
          createdBy: userId,
          dueDate: taskData.dueDate ? new Date(taskData.dueDate) : null,
        },
      });

      if (assigneeIds?.length) {
        await tx.taskAssignee.createMany({
          data: assigneeIds.map((uid) => ({ taskId: created.id, userId: uid })),
          skipDuplicates: true,
        });
      }

      return tx.task.findUnique({
        where: { id: created.id },
        include: {
          assignees: {
            include: {
              user: { select: { id: true, name: true, email: true, avatar: true } },
            },
          },
          creator: { select: { id: true, name: true, email: true, avatar: true } },
        },
      });
    });

    // Notify assignees
    if (assigneeIds?.length && task) {
      const assignees = await prisma.user.findMany({
        where: { id: { in: assigneeIds } },
        select: { id: true, email: true, name: true, emailNotifications: true },
      });

      for (const assignee of assignees) {
        if (assignee.emailNotifications && assignee.id !== userId) {
          queueTaskAssignmentEmail(
            assignee.email, assignee.name, task.title, task.id, workspaceId
          ).catch(console.error);
        }
      }
    }

    const io = req.app.get('io');
    io?.to(`workspace:${workspaceId}`).emit('task:created', task);

    res.status(201).json({ task });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
};

export const listTasks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { workspaceId } = req.params;
    const userId = req.user!.id;

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    if (!member) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const {
      tags, category, status, priority, assigneeId,
      dateFrom, dateTo, search, page = '1', limit = '50',
    } = req.query as Record<string, string>;

    const where: Record<string, unknown> = { workspaceId };

    if (tags) {
      const tagArray = tags.split(',').filter(Boolean);
      if (tagArray.length) {
        where['tags'] = { hasSome: tagArray };
      }
    }
    if (category) where['category'] = category;
    if (status) where['status'] = status;
    if (priority) where['priority'] = priority;
    if (assigneeId) where['assignees'] = { some: { userId: assigneeId } };
    if (search) where['title'] = { contains: search, mode: 'insensitive' };
    if (dateFrom || dateTo) {
      where['dueDate'] = {};
      if (dateFrom) (where['dueDate'] as Record<string, unknown>)['gte'] = new Date(dateFrom);
      if (dateTo) (where['dueDate'] as Record<string, unknown>)['lte'] = new Date(dateTo);
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          assignees: {
            include: {
              user: { select: { id: true, name: true, email: true, avatar: true } },
            },
          },
          creator: { select: { id: true, name: true, email: true, avatar: true } },
          _count: { select: { updates: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.task.count({ where }),
    ]);

    res.json({
      tasks,
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    console.error('List tasks error:', error);
    res.status(500).json({ error: 'Failed to list tasks' });
  }
};

export const getTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const userId = req.user!.id;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignees: {
          include: {
            user: { select: { id: true, name: true, email: true, avatar: true } },
          },
        },
        creator: { select: { id: true, name: true, email: true, avatar: true } },
        workspace: { select: { id: true, name: true } },
        _count: { select: { updates: true } },
      },
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: task.workspaceId } },
    });
    if (!member) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.json({ task });
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ error: 'Failed to get task' });
  }
};

export const updateTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const userId = req.user!.id;

    const existing = await prisma.task.findUnique({ where: { id: taskId } });
    if (!existing) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: existing.workspaceId } },
    });
    if (!member) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Members can only edit tasks they are assigned to
    if (member.role === 'member') {
      const isAssignee = await prisma.taskAssignee.findUnique({
        where: { taskId_userId: { taskId, userId } },
      });
      if (!isAssignee && existing.createdBy !== userId) {
        res.status(403).json({ error: 'You can only edit tasks you are assigned to or created' });
        return;
      }
    }

    const { assigneeIds, ...rest } = UpdateTaskSchema.parse(req.body);

    const task = await prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data: {
          ...rest,
          dueDate: rest.dueDate ? new Date(rest.dueDate) : rest.dueDate === null ? null : undefined,
        },
      });

      if (assigneeIds !== undefined) {
        await tx.taskAssignee.deleteMany({ where: { taskId } });
        if (assigneeIds.length > 0) {
          await tx.taskAssignee.createMany({
            data: assigneeIds.map((uid) => ({ taskId, userId: uid })),
            skipDuplicates: true,
          });
        }
      }

      return tx.task.findUnique({
        where: { id: taskId },
        include: {
          assignees: {
            include: {
              user: { select: { id: true, name: true, email: true, avatar: true } },
            },
          },
          creator: { select: { id: true, name: true, email: true, avatar: true } },
        },
      });
    });

    const io = req.app.get('io');
    io?.to(`workspace:${existing.workspaceId}`).emit('task:updated', task);

    res.json({ task });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
};

export const deleteTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const userId = req.user!.id;

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: task.workspaceId } },
    });
    if (!member) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Members can only delete tasks they created
    if (member.role === 'member' && task.createdBy !== userId) {
      res.status(403).json({ error: 'You can only delete tasks you created' });
      return;
    }

    await prisma.task.delete({ where: { id: taskId } });

    const io = req.app.get('io');
    io?.to(`workspace:${task.workspaceId}`).emit('task:deleted', { taskId });

    res.json({ message: 'Task deleted' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
};

export const assignTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const { userId: assigneeId } = req.body as { userId: string };
    const requesterId = req.user!.id;

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: requesterId, workspaceId: task.workspaceId } },
    });
    if (!member) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    await prisma.taskAssignee.create({
      data: { taskId, userId: assigneeId },
    });

    const assignee = await prisma.user.findUnique({
      where: { id: assigneeId },
      select: { email: true, name: true, emailNotifications: true },
    });

    if (assignee?.emailNotifications && assigneeId !== requesterId) {
      queueTaskAssignmentEmail(
        assignee.email, assignee.name, task.title, task.id, task.workspaceId
      ).catch(console.error);
    }

    res.json({ message: 'Assignee added' });
  } catch (error) {
    console.error('Assign task error:', error);
    res.status(500).json({ error: 'Failed to assign task' });
  }
};

export const removeAssignee = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { taskId, userId: assigneeId } = req.params;
    const requesterId = req.user!.id;

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: requesterId, workspaceId: task.workspaceId } },
    });
    if (!member) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    await prisma.taskAssignee.delete({
      where: { taskId_userId: { taskId, userId: assigneeId } },
    });

    res.json({ message: 'Assignee removed' });
  } catch (error) {
    console.error('Remove assignee error:', error);
    res.status(500).json({ error: 'Failed to remove assignee' });
  }
};

export const createTaskUpdate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const userId = req.user!.id;
    const data = TaskUpdateSchema.parse(req.body);

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: task.workspaceId } },
    });
    if (!member) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const update = await prisma.taskUpdate.create({
      data: { taskId, userId, content: data.content },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
    });

    // Handle @mentions
    const mentionRegex = /@(\w+)/g;
    const mentions = data.content.match(mentionRegex);
    if (mentions) {
      const commenter = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });

      const workspaceMembers = await prisma.workspaceMember.findMany({
        where: { workspaceId: task.workspaceId },
        include: {
          user: {
            select: { id: true, name: true, email: true, emailNotifications: true },
          },
        },
      });

      for (const mention of mentions) {
        const mentionedName = mention.slice(1).toLowerCase();
        const mentioned = workspaceMembers.find(
          (m) => m.user.name.toLowerCase().replace(/\s+/g, '') === mentionedName
        );
        if (mentioned && mentioned.user.id !== userId && mentioned.user.emailNotifications) {
          queueMentionNotification(
            mentioned.user.email,
            mentioned.user.name,
            commenter?.name || 'Someone',
            task.title,
            task.id,
            task.workspaceId
          ).catch(console.error);
        }
      }
    }

    const io = req.app.get('io');
    io?.to(`workspace:${task.workspaceId}`).emit('task:commented', { taskId, update });

    res.status(201).json({ update });
  } catch (error) {
    console.error('Create update error:', error);
    res.status(500).json({ error: 'Failed to post update' });
  }
};

export const listTaskUpdates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const userId = req.user!.id;
    const { page = '1', limit = '20' } = req.query as Record<string, string>;

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: task.workspaceId } },
    });
    if (!member) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const [updates, total] = await Promise.all([
      prisma.taskUpdate.findMany({
        where: { taskId },
        include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
        orderBy: { createdAt: 'asc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.taskUpdate.count({ where: { taskId } }),
    ]);

    res.json({ updates, pagination: { total, page: pageNum, limit: limitNum } });
  } catch (error) {
    console.error('List updates error:', error);
    res.status(500).json({ error: 'Failed to list updates' });
  }
};

export const deleteTaskUpdate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { updateId } = req.params;
    const userId = req.user!.id;

    const update = await prisma.taskUpdate.findUnique({ where: { id: updateId } });
    if (!update) {
      res.status(404).json({ error: 'Update not found' });
      return;
    }

    if (update.userId !== userId) {
      res.status(403).json({ error: 'Can only delete your own updates' });
      return;
    }

    await prisma.taskUpdate.delete({ where: { id: updateId } });
    res.json({ message: 'Update deleted' });
  } catch (error) {
    console.error('Delete update error:', error);
    res.status(500).json({ error: 'Failed to delete update' });
  }
};
