import { Router } from 'express';
import {
  getTask,
  updateTask,
  deleteTask,
  assignTask,
  removeAssignee,
  createTaskUpdate,
  listTaskUpdates,
  deleteTaskUpdate,
} from '../controllers/taskController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// Task CRUD (individual task operations by taskId)
router.get('/:taskId', getTask);
router.patch('/:taskId', updateTask);
router.delete('/:taskId', deleteTask);

// Assignees
router.post('/:taskId/assign', assignTask);
router.delete('/:taskId/assignees/:userId', removeAssignee);

// Updates/Comments
router.post('/:taskId/updates', createTaskUpdate);
router.get('/:taskId/updates', listTaskUpdates);
router.delete('/:taskId/updates/:updateId', deleteTaskUpdate);

export default router;
