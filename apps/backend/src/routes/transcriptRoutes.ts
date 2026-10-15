import { Router } from 'express';
import { authMiddleware, staffOnly } from '../middleware/auth';
import { transcribeAudioBase64 } from '../controllers/transcriptController';

const router = Router();

router.post('/transcribe', authMiddleware, staffOnly, transcribeAudioBase64);

export default router;
