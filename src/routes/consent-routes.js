import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { createConsentController } from '../controllers/consent-controller.js';

export function createConsentRouter(authService, consentService) {
  const router = Router();
  const controller = createConsentController(consentService);
  router.use(authenticate(authService), authorize('patient'));
  router.get('/', controller.listOwn);
  router.post('/', controller.grant);
  router.delete('/:doctorId', controller.revoke);
  return router;
}
export function createDoctorConsentRouter(authService, consentService) {
  const router = Router();
  const controller = createConsentController(consentService);
  router.use(authenticate(authService), authorize('doctor'));
  router.get('/patients', controller.listForDoctor);
  return router;
}