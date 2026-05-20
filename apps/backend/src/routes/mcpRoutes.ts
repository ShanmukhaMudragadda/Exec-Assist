import { Router } from 'express';
import { initiateMcpAuth, mcpCallback, refreshAccessToken, mcpLogout } from '../controllers/mcpAuthController';

const router = Router();

// No auth middleware — these are the auth endpoints themselves
router.get('/api/auth/mcp', initiateMcpAuth);
router.get('/api/auth/mcp/callback', mcpCallback);
router.post('/api/auth/refresh', refreshAccessToken);
router.post('/api/auth/logout', mcpLogout);

export default router;
