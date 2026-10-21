
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { createAuthRouter } from './routes/auth-routes.js';
import { createHealthRouter } from './routes/health-routes.js';
import { createPatientRouter } from './routes/patient-routes.js';
import {
  createDoctorMedicalRecordRouter,
  createMedicalRecordRouter
} from './routes/medical-record-routes.js';
import {
  createConsentRouter,
  createDoctorConsentRouter
} from './routes/consent-routes.js';
import { createAccountRouter } from './routes/account-routes.js';
import {
  createDoctorPrescriptionRouter,
  createPharmacyPrescriptionRouter,
  createPatientPrescriptionRouter
} from './routes/prescription-routes.js';
import { createEmergencyAccessRouter, createPatientEmergencyAccessRouter } from './routes/emergency-access-routes.js';
import {
  createEmergencyProfilePatientRouter,
  createEmergencyProfileDoctorRouter,
  createEmergencyProfileAccessRequestPatientRouter,
  createEmergencyProfileAccessRequestDoctorRouter
} from './routes/emergency-profile-routes.js';
import { createAuditRouter } from './routes/audit-routes.js';
import { createAdminRouter } from './routes/admin-routes.js';
import { errorHandler, notFound } from './middleware/error-handler.js';

export function createApp({
  authService,
  medicalRecordService,
  walletService,
  consentService,
  prescriptionService,
  emergencyAccessService,
  emergencyProfileService,
  emergencyProfileAccessRequestService,
  auditRepository,
  adminService,
  integrityService,
  signingKeyService,
  corsOrigin
}) {
  const app = express();

  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors(corsOrigin
    ? { origin: corsOrigin.split(',').map((origin) => origin.trim()).filter(Boolean) }
    : undefined));
  app.use(express.json({ limit: '1mb' }));

  // Authentication and health
  app.use('/api/v1/auth', createAuthRouter(authService));
  app.use('/api/v1/health', createHealthRouter(authService));

  // Patient wallet
  if (walletService) {
    app.use('/api/v1/patients', createPatientRouter(authService, walletService));
  }

  // Wallet and account
  if (walletService) {
    app.use(
      '/api/v1/account',
      createAccountRouter(authService, walletService, signingKeyService)
    );
  }

  // Medical records
  if (medicalRecordService) {
    app.use(
      '/api/v1/patients',
      createMedicalRecordRouter(authService, medicalRecordService)
    );
  }

  if (medicalRecordService && consentService) {
    app.use(
      '/api/v1/doctor',
      createDoctorMedicalRecordRouter(
        authService,
        medicalRecordService
      )
    );
  }

  // Patient-doctor consent
  if (consentService) {
    app.use(
      '/api/v1/consents',
      createConsentRouter(authService, consentService)
    );

    app.use(
      '/api/v1/doctor',
      createDoctorConsentRouter(authService, consentService)
    );
  }

  // Prescriptions
  if (prescriptionService) {
    app.use(
      '/api/v1/patients',
      createPatientPrescriptionRouter(
        authService,
        prescriptionService
      )
    );

    app.use(
      '/api/v1/doctor',
      createDoctorPrescriptionRouter(
        authService,
        prescriptionService
      )
    );

    app.use(
      '/api/v1/pharmacy',
      createPharmacyPrescriptionRouter(
        authService,
        prescriptionService
      )
    );
  }

  // Glass-break emergency access
  if (emergencyAccessService) {
    app.use(
      '/api/v1/emergency-access',
      createEmergencyAccessRouter(
        authService,
        emergencyAccessService
      )
    );
    app.use(
      '/api/v1/patients',
      createPatientEmergencyAccessRouter(
        authService,
        emergencyAccessService
      )
    );
  }

  // Emergency medical profile
  if (emergencyProfileService) {
    app.use(
      '/api/v1/patients',
      createEmergencyProfilePatientRouter(
        authService,
        emergencyProfileService
      )
    );

    app.use(
      '/api/v1/doctor',
      createEmergencyProfileDoctorRouter(
        authService,
        emergencyProfileService
      )
    );
  }

  // Emergency profile access requests and patient decisions
  if (emergencyProfileAccessRequestService) {
    app.use(
      '/api/v1/patients',
      createEmergencyProfileAccessRequestPatientRouter(
        authService,
        emergencyProfileAccessRequestService
      )
    );

    app.use(
      '/api/v1/doctor',
      createEmergencyProfileAccessRequestDoctorRouter(
        authService,
        emergencyProfileAccessRequestService
      )
    );
  }

  // Audit and administration
  if (auditRepository) {
    app.use(
      '/api/v1/audit-events',
      createAuditRouter(authService, auditRepository)
    );
  }

  if (adminService) {
    app.use(
      '/api/v1/admin',
      createAdminRouter(authService, adminService, integrityService)
    );
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
