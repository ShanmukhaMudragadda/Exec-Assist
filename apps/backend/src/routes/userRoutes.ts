import { Router } from 'express';
import { updateProfile, changePassword, getUserById } from '../controllers/userController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.patch('/me', authMiddleware, updateProfile);
router.post('/me/password', authMiddleware, changePassword);
router.get('/:id', authMiddleware, getUserById);

export default router;
