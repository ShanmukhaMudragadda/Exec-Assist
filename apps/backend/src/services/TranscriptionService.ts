import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

const mimeTypeMap: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.webm': 'audio/webm',
  '.mp4': 'audio/mp4',
};

export async function transcribeAudio(filePath: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const base64Audio = fileBuffer.toString('base64');
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = mimeTypeMap[ext] || 'audio/mpeg';

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const result = await model.generateContent([
      { text: 'Please transcribe this audio file. Return only the transcribed text, nothing else.' },
      { inlineData: { mimeType, data: base64Audio } },
    ]);

    return result.response.text().trim();
  } catch (error) {
    console.error('Gemini transcribeAudio error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to transcribe audio: ${msg}`);
  }
}
