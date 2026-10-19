import { Router } from "express";

import { createPrescriptionController } from "../controllers/prescription-controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";

// --------------------------------------------------
// DOCTOR PRESCRIPTION ROUTES
// --------------------------------------------------

export function createDoctorPrescriptionRouter(
  authService,
  prescriptionService
) {
  const router = Router();
  const controller = createPrescriptionController(prescriptionService);

  router.get(
    "/prescriptions",
    authenticate(authService),
    authorize("patient"),
    controller.listForPatient
  );

  // Typed prescription form (JSON), signed with the doctor's password.
  router.post(
    "/prescriptions",
    authenticate(authService),
    authorize("doctor"),
    controller.create
  );

  // Each prescription needs its own patient approval.
  router.post(
    "/patients/:patientId/prescription-requests",
    authenticate(authService),
    authorize("doctor"),
    controller.requestApproval
  );

  router.get(
    "/patients/:patientId/prescription-requests",
    authenticate(authService),
    authorize("doctor"),
    controller.listApprovalsForDoctor
  );

  return router;
}

// --------------------------------------------------
// PHARMACY PRESCRIPTION ROUTES
// --------------------------------------------------

export function createPharmacyPrescriptionRouter(
  authService,
  prescriptionService
) {
  const router = Router();
  const controller = createPrescriptionController(prescriptionService);

  router.get(
    "/history",
    authenticate(authService),
    authorize("pharmacy"),
    controller.pharmacyHistory
  );

  router.get(
    "/prescriptions/:prescriptionId/verify",
    authenticate(authService),
    authorize("pharmacy"),
    controller.verifyForPharmacy
  );

  return router;
}

// --------------------------------------------------
// PATIENT PRESCRIPTION ROUTES
// --------------------------------------------------

export function createPatientPrescriptionRouter(
  authService,
  prescriptionService
) {
  const router = Router();
  const controller = createPrescriptionController(prescriptionService);

  router.get(
    "/me/prescriptions",
    authenticate(authService),
    authorize("patient"),
    controller.listForPatient
  );

  router.get(
    "/me/prescription-requests",
    authenticate(authService),
    authorize("patient"),
    controller.listApprovalsForPatient
  );

  router.post("/me/prescription-requests/:requestId/approve", authenticate(authService), authorize("patient"), controller.approve);
  router.post("/me/prescription-requests/:requestId/reject", authenticate(authService), authorize("patient"), controller.reject);
  router.post("/me/prescription-requests/:requestId/revoke", authenticate(authService), authorize("patient"), controller.revoke);

  router.get(
    "/me/prescriptions/:prescriptionId",
    authenticate(authService),
    authorize("patient"),
    controller.viewForPatient
  );

  router.get(
    "/me/prescriptions/:prescriptionId/download",
    authenticate(authService),
    authorize("patient"),
    controller.downloadForPatient
  );

  return router;
}