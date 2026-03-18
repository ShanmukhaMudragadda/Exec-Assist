import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { TranscriptTextSchema } from '../utils/validators';
import { extractTasksFromTranscript, WorkspaceMemberForAI } from '../services/AIService';
import { transcribeAudio } from '../services/TranscriptionService';
import { z } from 'zod';

const prisma = new PrismaClient();

export const uploadTranscript = async (
  req: AuthRequest & { file?: Express.Multer.File },
  res: Response
): Promise<void> => {
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

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const transcription = await transcribeAudio(file.path);

    const transcript = await prisma.transcript.create({
      data: {
        workspaceId,
        title: file.originalname,
        content: transcription,
        type: 'recording',
        sourceUrl: file.path,
        processed: false,
      },
    });

    res.json({ transcript, transcription });
  } catch (error) {
    console.error('Upload transcript error:', error);
    res.status(500).json({ error: 'Failed to process audio file' });
  }
};

export const createTextTranscript = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const data = TranscriptTextSchema.parse(req.body);

    const transcript = await prisma.transcript.create({
      data: { workspaceId, ...data, processed: false },
    });

    res.status(201).json({ transcript });
  } catch (error) {
    console.error('Create text transcript error:', error);
    res.status(500).json({ error: 'Failed to create transcript' });
  }
};

export const listTranscripts = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const transcripts = await prisma.transcript.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ transcripts });
  } catch (error) {
    console.error('List transcripts error:', error);
    res.status(500).json({ error: 'Failed to list transcripts' });
  }
};

export const generateTasksFromTranscript = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { workspaceId, transcriptId } = req.params;
    const userId = req.user!.id;

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    if (!member) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const transcript = await prisma.transcript.findUnique({
      where: { id: transcriptId },
    });

    if (!transcript || transcript.workspaceId !== workspaceId) {
      res.status(404).json({ error: 'Transcript not found' });
      return;
    }

    // Fetch workspace members so AI can assign by name mention and profile match
    const workspaceMembers = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, name: true } } },
    });
    const membersForAI: WorkspaceMemberForAI[] = workspaceMembers.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      profile: m.profile ?? null,
    }));

    const extractedTasks = await extractTasksFromTranscript(transcript.content, membersForAI);

    res.json({ transcriptId, extractedTasks, count: extractedTasks.length });
  } catch (error) {
    console.error('Generate tasks error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate tasks';
    res.status(500).json({ error: message });
  }
};

const SaveTasksSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      category: z.string().optional(),
      tags: z.array(z.string()).default([]),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
      dueDate: z.string().optional().nullable(),
      status: z.string().optional(),
      assigneeIds: z.array(z.string()).default([]),
    })
  ),
});

export const saveGeneratedTasks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { workspaceId, transcriptId } = req.params;
    const userId = req.user!.id;

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    if (!member) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const { tasks } = SaveTasksSchema.parse(req.body);

    // Verify assignee IDs actually belong to this workspace
    const allAssigneeIds = [...new Set(tasks.flatMap((t) => t.assigneeIds))];
    const validMembers = allAssigneeIds.length > 0
      ? await prisma.workspaceMember.findMany({
          where: { workspaceId, userId: { in: allAssigneeIds } },
          select: { userId: true },
        })
      : [];
    const validMemberIds = new Set(validMembers.map((m) => m.userId));

    const savedTasks = await prisma.$transaction(async (tx) => {
      const created = await Promise.all(
        tasks.map(async (task) => {
          const safeAssigneeIds = task.assigneeIds.filter((id) => validMemberIds.has(id));
          const created = await tx.task.create({
            data: {
              workspaceId,
              createdBy: userId,
              title: task.title,
              description: task.description,
              category: task.category,
              tags: task.tags,
              priority: task.priority,
              status: (task.status as any) || 'todo',
              dueDate: task.dueDate ? new Date(task.dueDate) : null,
              sourceType: 'transcript',
              sourceId: transcriptId,
            },
          });
          if (safeAssigneeIds.length > 0) {
            await tx.taskAssignee.createMany({
              data: safeAssigneeIds.map((uid) => ({ taskId: created.id, userId: uid })),
              skipDuplicates: true,
            });
          }
          return created;
        })
      );

      await tx.transcript.update({
        where: { id: transcriptId },
        data: { processed: true },
      });

      return created;
    });

    res.json({ savedCount: savedTasks.length, tasks: savedTasks });
  } catch (error) {
    console.error('Save tasks error:', error);
    res.status(500).json({ error: 'Failed to save tasks' });
  }
};
