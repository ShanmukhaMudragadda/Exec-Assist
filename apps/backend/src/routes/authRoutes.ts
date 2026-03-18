import { Router } from 'express';
import {
  register,
  login,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  getMe,
  googleAuth,
} from '../controllers/authController';
import { authMiddleware } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/verify-email', verifyEmail);
router.post('/reset-password', authLimiter, requestPasswordReset);
router.post('/new-password', authLimiter, resetPassword);
router.post('/google', authLimiter, googleAuth);
router.get('/me', authMiddleware, getMe);

export default router;
