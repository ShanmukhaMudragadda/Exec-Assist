import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { transcribeAudioBase64 } from '../controllers/transcriptController';

const router = Router();

router.post('/transcribe', authMiddleware, transcribeAudioBase64);

export default router;
