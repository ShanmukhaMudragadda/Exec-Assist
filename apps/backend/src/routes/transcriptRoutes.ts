import { Router } from 'express';
import multer from 'multer';
import {
  uploadTranscript,
  createTextTranscript,
  listTranscripts,
  generateTasksFromTranscript,
  saveGeneratedTasks,
} from '../controllers/transcriptController';
import { authMiddleware } from '../middleware/auth';

const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/mp4',
      'audio/m4a',
      'audio/x-m4a',
      'audio/aac',
      'audio/ogg',
      'audio/flac',
      'audio/webm',
      'audio/3gpp',
      'video/mp4',   // some devices send m4a with video/mp4 MIME
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

const router = Router();

router.use(authMiddleware);

router.post('/:workspaceId/transcripts/upload', upload.single('audio'), uploadTranscript);
router.post('/:workspaceId/transcripts/text', createTextTranscript);
router.get('/:workspaceId/transcripts', listTranscripts);
router.post(
  '/:workspaceId/transcripts/:transcriptId/generate-tasks',
  generateTasksFromTranscript
);
router.post('/:workspaceId/transcripts/:transcriptId/save-tasks', saveGeneratedTasks);

export default router;
