import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { createAuditController } from '../controllers/audit-controller.js';

export function createAuditRouter(authService, auditRepository) {
  const router = Router();
  const controller = createAuditController(auditRepository);
  router.get('/me', authenticate(authService), authorize('patient'), controller.listOwn);
  return router;
}
