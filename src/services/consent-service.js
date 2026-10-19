
import { AppError } from '../utils/app-error.js';

// A license link is short-lived: the patient can revoke it early, and once it
// lapses the doctor has to be linked again.
export const CONSENT_DURATION_MINUTES = 30;

export class ConsentService {
  constructor({
    consentRepository,
    userRepository,
    recordRegistryClient,
    auditService,
  }) {
    this.consentRepository = consentRepository;
    this.userRepository = userRepository;
    this.recordRegistryClient = recordRegistryClient;
    this.auditService = auditService;
  }

  requireRegistry() {
    if (
      !this.recordRegistryClient ||
      typeof this.recordRegistryClient.grantAccess !== 'function' ||
      typeof this.recordRegistryClient.revokeAccess !== 'function' ||
      typeof this.recordRegistryClient.hasAccess !== 'function'
    ) {
      throw new AppError(
        503,
        'Blockchain consent service is unavailable.',
        'BLOCKCHAIN_UNAVAILABLE',
      );
    }
  }

  async getConsentAddresses(patientUserId, doctorUserId) {
    const patient = await this.userRepository.findById(patientUserId);
    const doctor = await this.userRepository.findById(doctorUserId);

    if (!patient || patient.role !== 'patient') {
      throw new AppError(404, 'Patient not found.', 'PATIENT_NOT_FOUND');
    }

    if (
      !doctor ||
      doctor.role !== 'doctor' ||
      doctor.status !== 'active' ||
      !doctor.license_id
    ) {
      throw new AppError(
        404,
        'An active doctor with a registered medical license was not found.',
        'DOCTOR_LICENSE_NOT_FOUND',
      );
    }

    if (!patient.blockchain_address || !doctor.blockchain_address) {
      throw new AppError(
        409,
        'Both accounts must have blockchain addresses before consent can be granted.',
        'BLOCKCHAIN_ADDRESS_REQUIRED',
      );
    }

    return {
      patient,
      doctor,
      patientAddress: patient.blockchain_address,
      doctorAddress: doctor.blockchain_address,
    };
  }

  async listForPatient(patientUserId) {
    const consents =
      await this.consentRepository.listActiveForPatient(patientUserId);

    return consents.map((consent) => ({
      doctorUserId: consent.doctor_user_id,
      doctorEmail: consent.doctor_email,
      doctorName: consent.doctor_name,
      licenseId: consent.license_id,
      expiresAt: consent.expires_at,
      createdAt: consent.created_at,
    }));
  }

  async listForDoctor(doctorUserId) {
    const consents =
      await this.consentRepository.listActiveForDoctor(doctorUserId);

    return consents.map((consent) => ({
      patientUserId: consent.patient_user_id,
      patientName: consent.patient_name,
      patientEmail: consent.patient_email,
      expiresAt: consent.expires_at,
      createdAt: consent.created_at,
    }));
  }

  async grantByLicense(patientUserId, licenseId) {
    if (typeof licenseId !== 'string' || !licenseId.trim()) {
      throw new AppError(
        400,
        "Enter the doctor's medical license number.",
        'LICENSE_REQUIRED',
      );
    }

    const doctor =
      await this.userRepository.findActiveDoctorByLicenseId(
        licenseId.trim(),
      );

    if (!doctor) {
      throw new AppError(
        404,
        'No active, approved doctor was found for that medical license number.',
        'DOCTOR_LICENSE_NOT_FOUND',
      );
    }

    const expiresAt = new Date(Date.now() + CONSENT_DURATION_MINUTES * 60 * 1000);

    return this.grant(patientUserId, doctor.id, expiresAt);
  }

  async grant(patientUserId, doctorId, expiresAt) {
    const expiry = new Date(expiresAt).getTime();

    if (
      !expiresAt ||
      Number.isNaN(expiry) ||
      expiry <= Date.now()
    ) {
      throw new AppError(
        400,
        'Consent expiry must be a future date.',
        'INVALID_CONSENT_EXPIRY',
      );
    }

    const { patientAddress, doctorAddress } =
      await this.getConsentAddresses(patientUserId, doctorId);

    const existing = await this.consentRepository.findActive(
      patientUserId,
      doctorId,
    );

    if (existing) {
      throw new AppError(
        409,
        'Consent already exists for this doctor.',
        'CONSENT_EXISTS',
      );
    }

    this.requireRegistry();

    let transactionHash;

    try {
      transactionHash = await this.recordRegistryClient.grantAccess({
        patientAddress,
        doctorAddress,
        expiresAt: new Date(expiry),
      });

      if (!transactionHash) {
        throw new Error('Blockchain client returned no transaction hash.');
      }

      // Confirm the mined permission is actually effective.
      const hasAccess = await this.recordRegistryClient.hasAccess({
        patientAddress,
        doctorAddress,
      });

      if (!hasAccess) {
        throw new Error(
          'The mined transaction did not produce effective access.',
        );
      }
    } catch (error) {
      console.error('Blockchain consent grant failed:', error.message);

      throw new AppError(
        502,
        'Consent could not be confirmed on the blockchain. No successful grant was reported.',
        'BLOCKCHAIN_GRANT_FAILED',
      );
    }

    // If this database write fails, chain access may exist temporarily.
    // Doctor access still requires an active database consent.
    const consent = await this.consentRepository.grant({
      patientUserId,
      doctorUserId: doctorId,
      expiresAt: new Date(expiry),
      transactionHash,
    });

    await this.auditService?.record({
      eventType: 'consent_granted',
      actorUserId: patientUserId,
      subjectUserId: patientUserId,
      resourceType: 'consent',
      resourceId: consent.doctor_user_id,
      metadata: {
        patientId: consent.patient_user_id,
        doctorId: consent.doctor_user_id,
        transactionHash,
      },
    });

    return {
      id: `${consent.patient_user_id}:${consent.doctor_user_id}`,
      patientUserId: consent.patient_user_id,
      doctorUserId: consent.doctor_user_id,
      expiresAt: consent.expires_at,
      createdAt: consent.created_at,
      transactionHash,
    };
  }

  async revoke(patientUserId, doctorId) {
    const existing = await this.consentRepository.findActive(
      patientUserId,
      doctorId,
    );

    if (!existing) {
      throw new AppError(
        404,
        'Consent not found.',
        'CONSENT_NOT_FOUND',
      );
    }

    const { patientAddress, doctorAddress } =
      await this.getConsentAddresses(patientUserId, doctorId);

    this.requireRegistry();

    let transactionHash;

    try {
      transactionHash =
        await this.recordRegistryClient.revokeAccess({
          patientAddress,
          doctorAddress,
        });

      if (!transactionHash) {
        throw new Error('Blockchain client returned no transaction hash.');
      }

      const stillHasAccess =
        await this.recordRegistryClient.hasAccess({
          patientAddress,
          doctorAddress,
        });

      if (stillHasAccess) {
        throw new Error(
          'Blockchain still reports active access after revocation.',
        );
      }
    } catch (error) {
      console.error('Blockchain consent revocation failed:', error.message);

      throw new AppError(
        502,
        'Revocation could not be confirmed on the blockchain. The database consent was not marked revoked.',
        'BLOCKCHAIN_REVOCATION_FAILED',
      );
    }

    // Chain access is already revoked. If this fails, the database may
    // remain stale, but assertDoctorAccess below will deny access.
    const revoked = await this.consentRepository.revoke({
      patientUserId,
      doctorUserId: doctorId,
      transactionHash,
    });

    if (!revoked) {
      throw new AppError(
        409,
        'Blockchain access was revoked, but the database update needs reconciliation.',
        'CONSENT_REVOCATION_RECONCILIATION_REQUIRED',
      );
    }

    await this.auditService?.record({
      eventType: 'consent_revoked',
      actorUserId: patientUserId,
      subjectUserId: patientUserId,
      resourceType: 'consent',
      resourceId: revoked.doctor_user_id,
      metadata: {
        patientId: revoked.patient_user_id,
        doctorId: revoked.doctor_user_id,
        transactionHash,
      },
    });

    return {
      id: `${revoked.patient_user_id}:${revoked.doctor_user_id}`,
      patientUserId: revoked.patient_user_id,
      doctorUserId: revoked.doctor_user_id,
      revokedAt: revoked.revoked_at,
      transactionHash,
    };
  }

  async assertDoctorAccess(patientUserId, doctorUserId) {
    const consent = await this.consentRepository.findActive(
      patientUserId,
      doctorUserId,
    );

    if (!consent) {
      throw new AppError(
        403,
        'Valid patient consent is required to access these records.',
        'CONSENT_REQUIRED',
      );
    }

    const { patientAddress, doctorAddress } =
      await this.getConsentAddresses(patientUserId, doctorUserId);

    this.requireRegistry();

    let hasAccess;

    try {
      hasAccess = await this.recordRegistryClient.hasAccess({
        patientAddress,
        doctorAddress,
      });
    } catch (error) {
      console.error('Blockchain consent verification failed:', error.message);

      throw new AppError(
        503,
        'Doctor access cannot be verified because the blockchain is unavailable.',
        'BLOCKCHAIN_VERIFICATION_FAILED',
      );
    }

    if (!hasAccess) {
      throw new AppError(
        403,
        'Blockchain permission is absent or revoked. Doctor access is denied.',
        'CONSENT_REQUIRED',
      );
    }
  }
}
