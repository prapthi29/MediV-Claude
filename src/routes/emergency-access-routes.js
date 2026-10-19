import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { createEmergencyAccessController } from '../controllers/emergency-access-controller.js';

export function createEmergencyAccessRouter(authService, emergencyAccessService) {
  const router = Router();
  const controller = createEmergencyAccessController(emergencyAccessService);
  router.use(authenticate(authService), authorize('doctor'));
  router.post('/', controller.grant);
  router.get('/', controller.listActiveForDoctor);
  router.get('/patients/:patientId/basic-profile', controller.viewBasicProfile);
  return router;
}

// Patients see every glass-break on their account and can end one at once.
export function createPatientEmergencyAccessRouter(authService, emergencyAccessService) {
  const router = Router();
  const controller = createEmergencyAccessController(emergencyAccessService);
  router.get('/me/emergency-access', authenticate(authService), authorize('patient'), controller.listForPatient);
  router.post('/me/emergency-access/:grantId/revoke', authenticate(authService), authorize('patient'), controller.revokeForPatient);
  return router;
}
