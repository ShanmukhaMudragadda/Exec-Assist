import { Router } from 'express';
import { initiateMcpAuth, mcpCallback, refreshAccessToken, mcpLogout } from '../controllers/mcpAuthController';

const router = Router();

// No auth middleware — these are the auth endpoints themselves
router.get('/auth/mcp', initiateMcpAuth);
router.get('/auth/mcp/callback', mcpCallback);
router.post('/auth/refresh', refreshAccessToken);
router.post('/auth/logout', mcpLogout);

export default router;
