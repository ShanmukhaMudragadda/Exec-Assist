import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  createInitiative,
  listInitiatives,
  getInitiative,
  updateInitiative,
  deleteInitiative,
  listMembers,
  removeMember,
  updateMember,
  addMember,
  listActions,
  getSettings,
  updateSettings,
  listTags,
  createTag,
  deleteTag,
} from '../controllers/initiativeController';
import { listAllTags, createGlobalTag } from '../controllers/tagController';
import {
  createAction,
  bulkCreateActions,
  bulkUpdateActions,
  bulkDeleteActions,
  updateAction,
  deleteAction,
  getCommandCenter,
  generateActionsFromTranscript,
  generateStandaloneActions,
  getExecutiveBrief,
  getAction,
  createActionUpdate,
  updateActionUpdate,
} from '../controllers/actionController';

const router = Router();

// ── command center ──────────────────────────────────────────────────────────
router.get('/command-center', authMiddleware, getCommandCenter);
router.get('/executive-brief', authMiddleware, getExecutiveBrief);

// ── initiatives ─────────────────────────────────────────────────────────────
router.post('/initiatives', authMiddleware, createInitiative);
router.get('/initiatives', authMiddleware, listInitiatives);
router.get('/initiatives/:initiativeId', authMiddleware, getInitiative);
router.patch('/initiatives/:initiativeId', authMiddleware, updateInitiative);
router.delete('/initiatives/:initiativeId', authMiddleware, deleteInitiative);

// ── members ─────────────────────────────────────────────────────────────────
router.get('/initiatives/:initiativeId/members', authMiddleware, listMembers);
router.patch('/initiatives/:initiativeId/members/:memberId', authMiddleware, updateMember);
router.delete('/initiatives/:initiativeId/members/:memberId', authMiddleware, removeMember);

// ── add member ───────────────────────────────────────────────────────────────
router.post('/initiatives/:initiativeId/members/add', authMiddleware, addMember);

// ── settings ────────────────────────────────────────────────────────────────
router.get('/initiatives/:initiativeId/settings', authMiddleware, getSettings);
router.patch('/initiatives/:initiativeId/settings', authMiddleware, updateSettings);

// ── tags ─────────────────────────────────────────────────────────────────────
router.get('/tags', authMiddleware, listAllTags);                                    // workspace-level (global)
router.post('/tags', authMiddleware, createGlobalTag);                              // create global tag
router.get('/initiatives/:initiativeId/tags', authMiddleware, listTags);
router.post('/initiatives/:initiativeId/tags', authMiddleware, createTag);
router.delete('/initiatives/:initiativeId/tags/:tagId', authMiddleware, deleteTag);

// ── actions ─────────────────────────────────────────────────────────────────
router.get('/initiatives/:initiativeId/actions', authMiddleware, listActions);
router.post('/actions', authMiddleware, createAction);                           // standalone (no initiative)
router.post('/actions/generate', authMiddleware, generateStandaloneActions);     // AI generate without initiative
router.post('/initiatives/:initiativeId/actions', authMiddleware, createAction);
router.post('/initiatives/:initiativeId/actions/bulk', authMiddleware, bulkCreateActions);
router.post('/initiatives/:initiativeId/actions/generate', authMiddleware, generateActionsFromTranscript);
router.patch('/actions/bulk', authMiddleware, bulkUpdateActions);
router.delete('/actions/bulk', authMiddleware, bulkDeleteActions);
router.get('/actions/:actionId', authMiddleware, getAction);
router.patch('/actions/:actionId', authMiddleware, updateAction);
router.delete('/actions/:actionId', authMiddleware, deleteAction);
router.post('/actions/:actionId/updates', authMiddleware, createActionUpdate);
router.patch('/actions/:actionId/updates/:updateId', authMiddleware, updateActionUpdate);

export default router;
