import { AppError } from "../utils/app-error.js";
import { assertProfileActive } from "./profile-activation.js";

const MAX_DURATION_MS = 60 * 60 * 1000;
const MIN_REASON_LENGTH = 10;
const MAX_REASON_LENGTH = 1000;

export class EmergencyAccessService {
  constructor({
    emergencyAccessRepository,
    userRepository,
    medicalRecordRepository,
    auditService,
  }) {
    this.emergencyAccessRepository = emergencyAccessRepository;
    this.userRepository = userRepository;
    this.medicalRecordRepository = medicalRecordRepository;
    this.auditService = auditService;
  }

  async grant(doctorUserId, patientUserId, reason, expiresAt) {
    if (
      typeof reason !== "string" ||
      reason.trim().length < MIN_REASON_LENGTH ||
      reason.trim().length > MAX_REASON_LENGTH
    ) {
      throw new AppError(
        400,
        "The emergency reason must contain between 10 and 1,000 characters.",
        "INVALID_EMERGENCY_REASON"
      );
    }

    const expiry =
      expiresAt instanceof Date ? expiresAt : new Date(expiresAt);

    const now = Date.now();
    const expiryTime = expiry.getTime();

    if (
      Number.isNaN(expiryTime) ||
      expiryTime <= now ||
      expiryTime > now + MAX_DURATION_MS
    ) {
      throw new AppError(
        400,
        "Emergency access must expire in the future and within one hour.",
        "INVALID_EMERGENCY_EXPIRY"
      );
    }

    const doctor = await this.userRepository.findById(doctorUserId);
    const patient = await this.userRepository.findById(patientUserId);

    if (!doctor || doctor.role !== "doctor") {
      throw new AppError(
        403,
        "A valid doctor account is required.",
        "DOCTOR_ACCESS_REQUIRED"
      );
    }

    if (!patient || patient.role !== "patient") {
      throw new AppError(
        404,
        "Patient not found.",
        "PATIENT_NOT_FOUND"
      );
    }

    await assertProfileActive(this.userRepository, patientUserId);

    const grant = await this.emergencyAccessRepository.create({
      patientUserId,
      doctorUserId,
      reason: reason.trim(),
      expiresAt: expiry,
    });

    await this.auditService.record({
      eventType: "emergency_access_granted",
      actorUserId: doctorUserId,
      subjectUserId: patientUserId,
      resourceType: "emergency_access",
      resourceId: grant.id,
      metadata: {
        reason: reason.trim(),
        expiresAt: expiry.toISOString(),
      },
      expiresAt: expiry,
    });

    return this.publicGrant(grant);
  }

  async listEssentialRecords(doctorUserId, patientUserId) {
    const doctor = await this.userRepository.findById(doctorUserId);

    if (!doctor || doctor.role !== "doctor") {
      throw new AppError(
        403,
        "A valid doctor account is required.",
        "DOCTOR_ACCESS_REQUIRED"
      );
    }

    const patient = await this.userRepository.findById(patientUserId);

    if (!patient || patient.role !== "patient") {
      throw new AppError(
        404,
        "Patient not found.",
        "PATIENT_NOT_FOUND"
      );
    }

    // The repository must check that this grant belongs to this doctor
    // and patient and has not expired.
    const grant = await this.emergencyAccessRepository.findActive(
      patientUserId,
      doctorUserId
    );

    if (!grant) {
      throw new AppError(
        403,
        "Active emergency access is required.",
        "EMERGENCY_ACCESS_REQUIRED"
      );
    }

    // Recheck expiry at the service boundary as well.
    const expiresAt = new Date(grant.expires_at).getTime();

    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw new AppError(
        403,
        "Emergency access has expired.",
        "EMERGENCY_ACCESS_EXPIRED"
      );
    }

    const records =
      await this.medicalRecordRepository.listEssentialForPatient(
        patientUserId
      );

    await this.auditService.record({
      eventType: "emergency_records_accessed",
      actorUserId: doctorUserId,
      subjectUserId: patientUserId,
      resourceType: "emergency_access",
      resourceId: grant.id,
      metadata: {
        recordCount: records.length,
      },
      expiresAt: grant.expires_at,
    });

    return records;
  }

  publicGrant(grant) {
    return {
      id: grant.id,
      patientUserId: grant.patient_user_id,
      doctorUserId: grant.doctor_user_id,
      expiresAt: grant.expires_at,
      createdAt: grant.created_at,
    };
  }
}