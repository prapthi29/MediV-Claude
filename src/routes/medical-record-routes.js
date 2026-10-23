import { Router } from 'express';
import multer from 'multer';
import { createMedicalRecordController } from '../controllers/medical-record-controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 }
});

export function createMedicalRecordRouter(authService, medicalRecordService) {
  const router = Router();
  const controller = createMedicalRecordController(medicalRecordService);

  router.use(authenticate(authService), authorize('patient'));
  router.post(
    '/me/record-creation-requests/:requestId/revoke',
    controller.revokeRecordCreation
  );

  // Patient creation approvals: patients can decide, never upload.
  router.get(
    '/me/record-creation-requests',
    controller.listRecordCreationRequestsForPatient
  );
  router.post(
    '/me/record-creation-requests/:requestId/approve',
    controller.approveRecordCreation
  );
  router.post(
    '/me/record-creation-requests/:requestId/reject',
    controller.rejectRecordCreation
  );

  // Patient decisions for record-specific doctor update requests.
  router.get('/me/record-update-requests', controller.listRecordUpdateRequestsForPatient);
  router.post('/me/record-update-requests/:requestId/approve', controller.approveRecordUpdate);
  router.post('/me/record-update-requests/:requestId/reject', controller.rejectRecordUpdate);
  router.post('/me/record-update-requests/:requestId/revoke', controller.revokeRecordUpdate);

  // Patient-owned record viewing and verification.
  router.get('/me/records', controller.listOwn);
  router.get('/me/records/:recordId', controller.viewOwn);
  router.get('/me/records/:recordId/download', controller.downloadOwn);
  router.get('/me/records/:recordId/versions', controller.listOwnRecordVersions);
  router.get('/me/records/:recordId/versions/:version/download', controller.downloadOwnRecordVersion);
  router.post('/me/records/:recordId/verify', controller.verifyOwn);
  router.patch(
    '/me/records/:recordId/emergency-essential',
    controller.setOwnEmergencyEssential
  );

  // Existing patient decisions for record-specific viewing access.
  router.get(
    '/me/record-access-requests',
    controller.listAccessRequestsForPatient
  );
  router.post(
    '/me/record-access-requests/:requestId/approve',
    controller.approveRecordAccess
  );
  router.post(
    '/me/record-access-requests/:requestId/reject',
    controller.rejectRecordAccess
  );
  router.post(
    '/me/record-access-requests/:requestId/revoke',
    controller.revokeRecordAccess
  );

  return router;
}

export function createDoctorMedicalRecordRouter(authService, medicalRecordService) {
  const router = Router();
  const controller = createMedicalRecordController(medicalRecordService);

  router.use(authenticate(authService), authorize('doctor'));

  // Request patient approval before creating a record.
  router.post(
    '/patients/:patientId/record-creation-requests',
    controller.requestRecordCreation
  );
  router.get(
    '/patients/:patientId/record-creation-requests',
    controller.listRecordCreationRequestsForDoctor
  );

  router.get('/patients/:patientId/records', controller.listForDoctor);
  router.get('/patients/:patientId/records/:recordId/versions', controller.listDoctorRecordVersions);
  router.get('/patients/:patientId/records/:recordId/versions/:version/download', controller.downloadDoctorRecordVersion);
  // Uses up the patient's single-view approval, so it is a POST.
  router.post('/patients/:patientId/records/:recordId/view', controller.viewForDoctor);

  router.post(
    '/patients/:patientId/records/:recordId/access-request',
    controller.requestRecordAccess
  );

  // Multipart: approvalId, password, title, category, optional form (JSON) and optional file field document.
  router.post(
    '/patients/:patientId/records',
    upload.single('document'),
    controller.uploadForDoctor
  );


  return router;
}
