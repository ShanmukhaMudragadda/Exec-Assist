import { Router } from 'express';
import { getVapidPublicKey, subscribe, unsubscribe } from '../controllers/pushController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.get('/vapid-public-key', getVapidPublicKey);
router.post('/subscribe', authMiddleware, subscribe);
router.delete('/unsubscribe', authMiddleware, unsubscribe);

export default router;
