import { Router } from 'express';
import { googleAuth, getMe } from '../controllers/authController';
import { passwordLogin, verifyPasswordToken, setPassword, forgotPassword } from '../controllers/passwordAuthController';
import { authMiddleware } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/google', authLimiter, googleAuth);
router.get('/me', authMiddleware, getMe);

// Password sign-in — external users only
router.post('/password/login', authLimiter, passwordLogin);
router.post('/password/verify-token', authLimiter, verifyPasswordToken);
router.post('/password/set', authLimiter, setPassword);
router.post('/password/forgot', authLimiter, forgotPassword);

export default router;
