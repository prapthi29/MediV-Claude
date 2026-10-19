import { Router } from "express";
import multer from "multer";

import { createPrescriptionController } from "../controllers/prescription-controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
});



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

  router.post(
    "/prescriptions",
    authenticate(authService),
    authorize("doctor"),
    upload.single("document"),
    controller.create
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
    "/me/prescriptions/:prescriptionId/download",
    authenticate(authService),
    authorize("patient"),
    controller.downloadForPatient
  );

  return router;
}