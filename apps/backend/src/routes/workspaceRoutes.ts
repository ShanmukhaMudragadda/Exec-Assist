import { Router } from 'express';
import {
  createWorkspace,
  listWorkspaces,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  getMembers,
  updateMemberRole,
  removeMember,
  addMember,
  sendInvitation,
  acceptInvitation,
  rejectInvitation,
  getWorkspaceAnalytics,
} from '../controllers/workspaceController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// Workspace CRUD
router.post('/', createWorkspace);
router.get('/', listWorkspaces);
router.get('/:id', getWorkspace);
router.patch('/:id', updateWorkspace);
router.delete('/:id', deleteWorkspace);

// Members
router.get('/:id/members', getMembers);
router.post('/:id/members', addMember);
router.patch('/:id/members/:userId', updateMemberRole);
router.delete('/:id/members/:userId', removeMember);

// Invitations
router.post('/:id/invitations', sendInvitation);
router.post('/invitations/:invitationId/accept', acceptInvitation);
router.post('/invitations/:invitationId/reject', rejectInvitation);

// Analytics
router.get('/:id/analytics', getWorkspaceAnalytics);

export default router;
