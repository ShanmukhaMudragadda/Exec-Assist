import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { transcribeAudio } from '../services/TranscriptionService';
import os from 'os';
import path from 'path';
import fs from 'fs';

export const transcribeAudioBase64 = async (req: AuthRequest, res: Response): Promise<void> => {
  const { audio, mimeType = 'audio/webm' } = req.body as { audio?: string; mimeType?: string };

  if (!audio) {
    res.status(400).json({ error: 'audio is required' });
    return;
  }

  const ext = mimeType.includes('ogg') ? '.ogg' : mimeType.includes('mp4') ? '.mp4' : '.webm';
  const tmpPath = path.join(os.tmpdir(), `rec_${Date.now()}${ext}`);

  try {
    const buffer = Buffer.from(audio, 'base64');
    fs.writeFileSync(tmpPath, buffer);
    const transcript = await transcribeAudio(tmpPath);
    res.json({ transcript });
  } catch (err) {
    console.error('transcribeAudioBase64 error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
};
