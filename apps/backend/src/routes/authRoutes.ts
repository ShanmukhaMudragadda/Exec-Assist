import { Router } from 'express';
import { googleAuth, getMe } from '../controllers/authController';
import { authMiddleware } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/google', authLimiter, googleAuth);
router.get('/me', authMiddleware, getMe);

export default router;
