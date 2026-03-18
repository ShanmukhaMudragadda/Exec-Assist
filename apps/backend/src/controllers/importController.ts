import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { AuthRequest } from '../middleware/auth';
import { extractTasksFromExcel, WorkspaceMemberForAI } from '../services/AIService';

const prisma = new PrismaClient();

function sheetsToText(workbook: XLSX.WorkBook): string {
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as string[][];
    if (rows.length === 0) continue;

    parts.push(`Sheet: "${sheetName}"`);
    const headers = rows[0].map((h) => String(h).trim());
    parts.push(`Headers: ${headers.join(' | ')}`);

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      // Skip completely blank rows
      if (row.every((cell) => String(cell).trim() === '')) continue;
      const cells = headers.map((h, j) => `${h}: ${String(row[j] ?? '').trim()}`);
      parts.push(`Row ${i}: ${cells.join(' | ')}`);
    }
    parts.push('');
  }
  return parts.join('\n');
}

export const importFromExcel = async (
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

    const workbook = XLSX.readFile(file.path);
    const sheetsText = sheetsToText(workbook);

    if (!sheetsText.trim()) {
      res.status(400).json({ error: 'Spreadsheet appears to be empty' });
      return;
    }

    const workspaceMembers = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, name: true } } },
    });
    const membersForAI: WorkspaceMemberForAI[] = workspaceMembers.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      profile: m.profile ?? null,
    }));

    const extractedTasks = await extractTasksFromExcel(sheetsText, membersForAI);

    res.json({ extractedTasks, count: extractedTasks.length });
  } catch (error) {
    console.error('Import from Excel error:', error);
    const message = error instanceof Error ? error.message : 'Failed to process file';
    res.status(500).json({ error: message });
  }
};
