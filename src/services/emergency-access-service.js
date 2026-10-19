import crypto from "node:crypto";
import { AppError } from "../utils/app-error.js";
import { assertProfileActive } from "./profile-activation.js";
import { stableStringify } from "./basic-profile-signature.js";
import { SigningKeyService } from "./signing-key-service.js";

export const GLASS_BREAK_DURATIONS = [15, 30, 45];
const MIN_REASON_LENGTH = 10;
const MAX_REASON_LENGTH = 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// The exact request a doctor signs to break the glass.
export function glassBreakRequestSha256(payload) {
  return crypto.createHash("sha256").update(stableStringify(payload), "utf8").digest("hex");
}

export class EmergencyAccessService {
  constructor({
    emergencyAccessRepository,
    userRepository,
    emergencyProfileService,
    signingKeyService,
    auditService,
  }) {
    this.emergencyAccessRepository = emergencyAccessRepository;
    this.userRepository = userRepository;
    this.emergencyProfileService = emergencyProfileService;
    this.signingKeyService = signingKeyService;
    this.auditService = auditService;
  }

  // The doctor signs the request with their password-locked key. Access opens
  // only after that signature verifies against the doctor's own key.
  async grant(doctorUserId, patientIdentifier, reason, durationMinutes, password) {
    const trimmedReason = typeof reason === "string" ? reason.trim() : "";
    if (trimmedReason.length < MIN_REASON_LENGTH || trimmedReason.length > MAX_REASON_LENGTH) {
      throw new AppError(400, "The emergency reason must contain between 10 and 1,000 characters.", "INVALID_EMERGENCY_REASON");
    }
    if (!GLASS_BREAK_DURATIONS.includes(durationMinutes)) {
      throw new AppError(400, "Emergency access lasts 15, 30 or 45 minutes.", "INVALID_EMERGENCY_DURATION");
    }

    const doctor = await this.userRepository.findById(doctorUserId);
    if (!doctor || doctor.role !== "doctor" || doctor.status !== "active") {
      throw new AppError(403, "An active, approved doctor account is required.", "DOCTOR_ACCESS_REQUIRED");
    }

    const patient = await this.findPatient(patientIdentifier);
    await assertProfileActive(this.userRepository, patient.id);

    const existing = await this.emergencyAccessRepository.findActive(patient.id, doctorUserId);
    if (existing) return this.publicGrant(existing);

    const requestedAt = new Date();
    const payload = {
      type: "medivault-glass-break/1",
      doctorUserId,
      patientUserId: patient.id,
      reason: trimmedReason,
      durationMinutes,
      requestedAt: requestedAt.toISOString(),
    };
    const requestSha256 = glassBreakRequestSha256(payload);
    const { signature, signerAddress } = await this.signingKeyService.signDigest(doctorUserId, password, requestSha256);

    const signatureValid =
      SigningKeyService.verifyDigest(requestSha256, signature, signerAddress) &&
      (await this.signingKeyService.isKeyOfUser(signerAddress, doctorUserId));
    if (!signatureValid) {
      throw new AppError(403, "The emergency request signature did not verify, so access stays closed.", "EMERGENCY_SIGNATURE_INVALID");
    }

    const expiresAt = new Date(requestedAt.getTime() + durationMinutes * 60 * 1000);
    const created = await this.emergencyAccessRepository.create({
      patientUserId: patient.id,
      doctorUserId,
      reason: trimmedReason,
      expiresAt,
      durationMinutes,
      requestPayload: payload,
      requestSha256,
      doctorSignature: signature,
      signerAddress,
    });

    // The audit service anchors this event on the blockchain.
    await this.auditService.record({
      eventType: "emergency_access_granted",
      actorUserId: doctorUserId,
      subjectUserId: patient.id,
      resourceType: "emergency_access",
      resourceId: created.id,
      metadata: { reason: trimmedReason, durationMinutes, requestSha256, signerAddress, expiresAt: expiresAt.toISOString() },
      expiresAt,
    });

    const grant = await this.emergencyAccessRepository.findActive(patient.id, doctorUserId);
    return this.publicGrant(grant ?? created);
  }

  async findPatient(identifier) {
    const value = typeof identifier === "string" ? identifier.trim() : "";
    const patient = UUID_PATTERN.test(value)
      ? await this.userRepository.findById(value)
      : await this.userRepository.findByHealthId(value);
    if (!patient || patient.role !== "patient") {
      throw new AppError(404, "No patient has that health ID.", "PATIENT_NOT_FOUND");
    }
    return patient;
  }

  async listActiveForDoctor(doctorUserId) {
    const grants = await this.emergencyAccessRepository.listActiveForDoctor(doctorUserId);
    return grants.map((grant) => this.publicGrant(grant));
  }

  // Glass-break shows the basic profile only.
  async viewBasicProfile(doctorUserId, patientUserId) {
    const grant = await this.emergencyAccessRepository.findActive(patientUserId, doctorUserId);
    if (!grant) {
      throw new AppError(403, "Emergency access has ended or was revoked by the patient.", "EMERGENCY_ACCESS_REQUIRED");
    }

    const profile = await this.emergencyProfileService.getOwnProfile(patientUserId);

    await this.auditService.record({
      eventType: "emergency_profile_viewed",
      actorUserId: doctorUserId,
      subjectUserId: patientUserId,
      resourceType: "emergency_access",
      resourceId: grant.id,
      metadata: {},
      expiresAt: grant.expires_at,
    });

    return { grant: this.publicGrant(grant), profile };
  }

  async listForPatient(patientUserId) {
    const grants = await this.emergencyAccessRepository.listForPatient(patientUserId);
    return grants.map((grant) => this.publicGrant(grant));
  }

  async revokeForPatient(patientUserId, grantId) {
    const grant = await this.emergencyAccessRepository.revokeForPatient(grantId, patientUserId);
    if (!grant) {
      throw new AppError(409, "This emergency access has already ended.", "EMERGENCY_ACCESS_NOT_ACTIVE");
    }

    await this.auditService.record({
      eventType: "emergency_access_revoked",
      actorUserId: patientUserId,
      subjectUserId: grant.doctor_user_id,
      resourceType: "emergency_access",
      resourceId: grant.id,
      metadata: {},
    });

    return this.publicGrant(grant);
  }

  publicGrant(grant) {
    const active = !grant.revoked_at && new Date(grant.expires_at) > new Date();
    return {
      id: grant.id,
      patientUserId: grant.patient_user_id,
      patientName: grant.patient_name ?? null,
      patientHealthId: grant.patient_health_id ?? null,
      doctorUserId: grant.doctor_user_id,
      doctorName: grant.doctor_name ?? null,
      doctorLicenseId: grant.doctor_license_id ?? null,
      reason: grant.reason,
      durationMinutes: grant.duration_minutes ?? null,
      requestSha256: grant.request_sha256 ?? null,
      signerAddress: grant.signer_address ?? null,
      signed: Boolean(grant.doctor_signature),
      status: grant.revoked_at ? "revoked" : active ? "active" : "expired",
      expiresAt: grant.expires_at,
      revokedAt: grant.revoked_at ?? null,
      createdAt: grant.created_at,
    };
  }
}
