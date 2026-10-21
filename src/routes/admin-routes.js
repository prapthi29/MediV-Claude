import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { createAdminController } from '../controllers/admin-controller.js';

export function createAdminRouter(authService, adminService, integrityService) {
  const router = Router();
  const controller = createAdminController(adminService, integrityService);
  router.use(authenticate(authService), authorize('admin'));
  router.get('/users', controller.listAllUsers);
  router.get('/users/pending', controller.listPendingUsers);
  router.post('/users/:userId/approve', controller.approveUser);
  router.post('/users/:userId/reject', controller.rejectUser);
  router.get('/audit-events', controller.listAuditEvents);
  router.get('/integrity', controller.integrityStatus);
  router.post('/integrity/run', controller.runIntegrityCheck);
  return router;
}
