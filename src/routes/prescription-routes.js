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

  // A linked doctor can read the patient's prescriptions.
  router.get("/patients/:patientId/prescriptions", authenticate(authService), authorize("doctor"), controller.listForDoctor);
  router.get("/patients/:patientId/prescriptions/:prescriptionId", authenticate(authService), authorize("doctor"), controller.viewForDoctor);
  // Opening one needs the patient's approval; doctors cannot download.
  router.post("/patients/:patientId/prescriptions/:prescriptionId/view-requests", authenticate(authService), authorize("doctor"), controller.requestViewForDoctor);

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

  // Pharmacies only see prescriptions a patient shared with them in the last 30 minutes.
  router.get("/shares", authenticate(authService), authorize("pharmacy"), controller.listSharedWithPharmacy);
  router.get("/shares/:shareId", authenticate(authService), authorize("pharmacy"), controller.openForPharmacy);
  router.post("/shares/:shareId/dispense", authenticate(authService), authorize("pharmacy"), controller.dispense);

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

  router.get("/me/prescription-shares", authenticate(authService), authorize("patient"), controller.listSharesForPatient);
  router.get("/me/pharmacies/:licenseId", authenticate(authService), authorize("patient"), controller.findPharmacy);
  router.get("/me/prescription-view-requests", authenticate(authService), authorize("patient"), controller.listViewRequestsForPatient);
  router.post("/me/prescription-view-requests/:requestId/decision", authenticate(authService), authorize("patient"), controller.decideViewRequest);
  router.post("/me/prescription-shares/:shareId/revoke", authenticate(authService), authorize("patient"), controller.revokeShare);
  router.post("/me/prescriptions/:prescriptionId/shares", authenticate(authService), authorize("patient"), controller.share);

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