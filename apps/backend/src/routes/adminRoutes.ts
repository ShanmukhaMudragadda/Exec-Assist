import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/superAdmin';
import { listUsers, updateUserFeature, getAdminStats, getEltSummary, getEltUserWorkload } from '../controllers/adminController';

const router = Router();

// Super-admin only
router.get('/admin/users', authMiddleware, requireSuperAdmin, listUsers);
router.patch('/admin/users/:userId/features', authMiddleware, requireSuperAdmin, updateUserFeature);
router.get('/admin/stats', authMiddleware, requireSuperAdmin, getAdminStats);

// ELT — accessible to super-admin or users with elt_dashboard flag (checked inside controllers)
router.get('/elt/summary', authMiddleware, getEltSummary);
router.get('/elt/workload/:userId', authMiddleware, getEltUserWorkload);

export default router;
