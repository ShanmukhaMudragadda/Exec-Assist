import { Router } from 'express';
import { updateProfile, getUserById } from '../controllers/userController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.patch('/me', authMiddleware, updateProfile);
router.get('/:id', authMiddleware, getUserById);

export default router;
