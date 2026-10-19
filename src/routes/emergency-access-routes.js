import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { createEmergencyAccessController } from '../controllers/emergency-access-controller.js';

export function createEmergencyAccessRouter(authService, emergencyAccessService) {
  const router = Router();
  const controller = createEmergencyAccessController(emergencyAccessService);
  router.use(authenticate(authService), authorize('doctor'));
  router.post('/', controller.grant);
  router.get('/patients/:patientId/records', controller.listEssential);
  return router;
}
