
import { Router } from 'express';
import { createEmergencyProfileController } from '../controllers/emergency-profile-controller.js';
import {
  createEmergencyProfileAccessRequestController
} from '../controllers/emergency-profile-access-request-controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

export function createEmergencyProfilePatientRouter(authService, service) {
  const router = Router();
  const controller = createEmergencyProfileController(service);

  router.use(authenticate(authService), authorize('patient'));

  router.get('/me/emergency-profile', controller.getOwn);

  return router;
}

export function createEmergencyProfileDoctorRouter(authService, service) {
  const router = Router();
  const controller = createEmergencyProfileController(service);

  router.use(authenticate(authService), authorize('doctor'));

  router.get(
    '/patients/:patientId/emergency-profile',
    controller.getPatient
  );

  router.post(
    '/patients/:patientId/emergency-profile',
    controller.create
  );

  router.patch(
    '/patients/:patientId/emergency-profile',
    controller.update
  );

  return router;
}

export function createEmergencyProfileAccessRequestPatientRouter(
  authService,
  service
) {
  const router = Router();
  const controller =
    createEmergencyProfileAccessRequestController(service);

  router.use(authenticate(authService), authorize('patient'));

  router.get(
    '/me/emergency-profile-access-requests',
    controller.listForPatient
  );

  router.post(
    '/me/emergency-profile-access-requests/:requestId/decision',
    controller.decide
  );

  return router;
}

export function createEmergencyProfileAccessRequestDoctorRouter(
  authService,
  service
) {
  const router = Router();
  const controller =
    createEmergencyProfileAccessRequestController(service);

  router.use(authenticate(authService), authorize('doctor'));

  router.post(
    '/patients/:patientId/emergency-profile-access-requests',
    controller.request
  );

  router.get(
    '/patients/:patientId/emergency-profile-access-requests',
    controller.listForDoctor
  );

  return router;
}
