import { AppError } from '../utils/app-error.js';
import { ageFromDateOfBirth } from '../services/basic-profile-signature.js';

const PROFILE_COLUMNS = {
  bloodGroup: 'blood_group',
  gender: 'gender',
  dateOfBirth: 'date_of_birth',
  emergencyContactName: 'emergency_contact_name',
  emergencyContactPhone: 'emergency_contact_phone',
  emergencyContactRelationship: 'emergency_contact_relationship',
  allergies: 'allergies',
  allergiesStatus: 'allergies_status',
  chronicConditions: 'chronic_conditions',
  chronicConditionsStatus: 'chronic_conditions_status',
  currentMedications: 'current_medications',
  medicationsStatus: 'medications_status'
};

const PROFILE_SELECT = `SELECT p.*, u.name AS patient_name, u.patient_id,
              u.medical_record_status, d.name AS signed_by_doctor_name
       FROM patient_emergency_profiles p
       JOIN users u ON u.id = p.patient_user_id
       LEFT JOIN users d ON d.id = p.signed_by_doctor_id
       WHERE p.patient_user_id = $1`;

// pg returns DATE columns as local-midnight Date objects.
function isoDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const pad = (n) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function publicProfile(row) {
  if (!row) return null;
  const dateOfBirth = isoDate(row.date_of_birth);

  return {
    patientUserId: row.patient_user_id,
    patientName: row.patient_name,
    patientId: row.patient_id,
    medicalRecordStatus: row.medical_record_status,
    gender: row.gender ?? null,
    dateOfBirth,
    age: ageFromDateOfBirth(dateOfBirth),
    bloodGroup: row.blood_group,
    emergencyContact: {
      name: row.emergency_contact_name,
      phone: row.emergency_contact_phone,
      relationship: row.emergency_contact_relationship
    },
    allergies: row.allergies,
    allergiesStatus: row.allergies_status,
    chronicConditions: row.chronic_conditions,
    chronicConditionsStatus: row.chronic_conditions_status,
    currentMedications: row.current_medications,
    medicationsStatus: row.medications_status,
    createdByDoctorId: row.created_by_doctor_id,
    version: row.version,
    signature: {
      profileSha256: row.profile_sha256 ?? null,
      doctorSignature: row.doctor_signature ?? null,
      signerAddress: row.signer_address ?? null,
      signedByDoctorId: row.signed_by_doctor_id ?? null,
      signedByDoctorName: row.signed_by_doctor_name ?? null,
      signedAt: row.signed_at ?? null,
      blockchainStatus: row.blockchain_status ?? 'pending',
      blockchainTxHash: row.blockchain_tx_hash ?? null
    },
    lastReviewedAt: row.last_reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function approvalRequired(message) {
  return new AppError(403, message, 'PROFILE_APPROVAL_REQUIRED');
}

export class EmergencyProfileRepository {
  constructor(database, emergencyProfileAccessRequestRepository) {
    this.database = database;
    this.emergencyProfileAccessRequestRepository =
      emergencyProfileAccessRequestRepository;
  }

  // Patient self-access. This method does not expose doctor access.
  async findByPatientId(patientUserId) {
    const result = await this.database.query(
      PROFILE_SELECT,
      [patientUserId]
    );

    return publicProfile(result.rows[0] ?? null);
  }

  // Doctor profile read: consume a one-time view approval atomically
  // with reading the profile.
  async findByPatientIdForDoctor({
    patientUserId,
    doctorUserId,
    approvalRequestId
  }) {
    return this.database.transaction(async (client) => {
      const profileResult = await client.query(
        PROFILE_SELECT,
        [patientUserId]
      );

      if (!profileResult.rows[0]) {
        throw new AppError(
          404,
          'Basic profile not found.',
          'EMERGENCY_PROFILE_NOT_FOUND'
        );
      }

      const ids = {
        requestId: approvalRequestId,
        patientUserId,
        doctorUserId
      };

      // A view approval is used up here. An edit approval lets the doctor
      // load the current profile to edit and is used up only on save.
      const consumed =
        await this.emergencyProfileAccessRequestRepository?.consumeApproved(
          client,
          { ...ids, operation: 'view' }
        );
      const canEdit =
        !consumed &&
        (await this.emergencyProfileAccessRequestRepository?.isApproved({
          ...ids,
          operation: 'update'
        }));

      if (!consumed && !canEdit) {
        throw approvalRequired(
          'Patient approval to view the basic profile is required.'
        );
      }

      return publicProfile(profileResult.rows[0]);
    });
  }

  async create({
    patientUserId,
    doctorUserId,
    profile,
    reason,
    approvalRequestId,
    signature
  }) {
    return this.database.transaction(async (client) => {
      const patient = await client.query(
        `SELECT id, role, status, medical_record_status
         FROM users
         WHERE id = $1
         FOR UPDATE`,
        [patientUserId]
      );

      if (!patient.rows[0] || patient.rows[0].role !== 'patient') {
        throw new AppError(
          404,
          'Patient account not found.',
          'PATIENT_NOT_FOUND'
        );
      }

      const doctor = await client.query(
        `SELECT id
         FROM users
         WHERE id = $1
           AND role = 'doctor'
           AND status = 'active'`,
        [doctorUserId]
      );

      if (!doctor.rows[0]) {
        throw new AppError(
          403,
          'An active doctor account is required.',
          'ACTIVE_DOCTOR_REQUIRED'
        );
      }

      const existing = await client.query(
        `SELECT 1
         FROM patient_emergency_profiles
         WHERE patient_user_id = $1`,
        [patientUserId]
      );

      if (existing.rows.length) {
        throw new AppError(
          409,
          'This patient already has a basic profile. Ask to edit it instead.',
          'EMERGENCY_PROFILE_EXISTS'
        );
      }

      const consumed =
        await this.emergencyProfileAccessRequestRepository?.consumeApproved(
          client,
          {
            requestId: approvalRequestId,
            patientUserId,
            doctorUserId,
            operation: 'create'
          }
        );

      if (!consumed) {
        throw approvalRequired(
          'Approved profile-creation permission is required.'
        );
      }

      const inserted = await client.query(
        `INSERT INTO patient_emergency_profiles (
           patient_user_id,
           blood_group,
           emergency_contact_name,
           emergency_contact_phone,
           emergency_contact_relationship,
           allergies,
           allergies_status,
           chronic_conditions,
           chronic_conditions_status,
           current_medications,
           medications_status,
           created_by_doctor_id,
           last_reviewed_at,
           gender,
           date_of_birth,
           version,
           profile_sha256,
           doctor_signature,
           signer_address,
           signed_by_doctor_id,
           signed_at
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6::jsonb, $7, $8::jsonb, $9,
           $10::jsonb, $11, $12, NOW(),
           $13, $14, $15, $16, $17, $18, $12, NOW()
         )
         RETURNING *`,
        [
          patientUserId,
          profile.bloodGroup ?? null,
          profile.emergencyContactName ?? null,
          profile.emergencyContactPhone ?? null,
          profile.emergencyContactRelationship ?? null,
          JSON.stringify(profile.allergies),
          profile.allergiesStatus,
          JSON.stringify(profile.chronicConditions),
          profile.chronicConditionsStatus,
          JSON.stringify(profile.currentMedications),
          profile.medicationsStatus,
          doctorUserId,
          profile.gender ?? null,
          profile.dateOfBirth ?? null,
          signature.version,
          signature.profileSha256,
          signature.doctorSignature,
          signature.signerAddress
        ]
      );

      await client.query(
        `INSERT INTO patient_emergency_profile_audit
         (patient_user_id, doctor_user_id, action, changed_fields, change_reason,
          version, profile_sha256, doctor_signature, signer_address)
         VALUES ($1, $2, 'created', $3::jsonb, $4, $5, $6, $7, $8)`,
        [
          patientUserId,
          doctorUserId,
          JSON.stringify({
            profile: { previous: null, new: profile }
          }),
          reason,
          signature.version,
          signature.profileSha256,
          signature.doctorSignature,
          signature.signerAddress
        ]
      );

      await client.query(
        `UPDATE users
         SET medical_record_status = 'active',
             updated_at = NOW()
         WHERE id = $1`,
        [patientUserId]
      );

      const result = await client.query(
        PROFILE_SELECT,
        [patientUserId]
      );

      return publicProfile(result.rows[0] ?? inserted.rows[0]);
    });
  }

  async update({
    patientUserId,
    doctorUserId,
    changes,
    reason,
    approvalRequestId,
    signature
  }) {
    return this.database.transaction(async (client) => {
      const patient = await client.query(
        `SELECT id
         FROM users
         WHERE id = $1 AND role = 'patient'
         FOR UPDATE`,
        [patientUserId]
      );

      if (!patient.rows[0]) {
        throw new AppError(
          404,
          'Patient account not found.',
          'PATIENT_NOT_FOUND'
        );
      }

      const doctor = await client.query(
        `SELECT id
         FROM users
         WHERE id = $1
           AND role = 'doctor'
           AND status = 'active'`,
        [doctorUserId]
      );

      if (!doctor.rows[0]) {
        throw new AppError(
          403,
          'An active doctor account is required.',
          'ACTIVE_DOCTOR_REQUIRED'
        );
      }

      const currentResult = await client.query(
        `SELECT *
         FROM patient_emergency_profiles
         WHERE patient_user_id = $1
         FOR UPDATE`,
        [patientUserId]
      );

      const current = currentResult.rows[0];

      if (!current) {
        throw new AppError(
          404,
          'Create the basic profile first.',
          'EMERGENCY_PROFILE_NOT_FOUND'
        );
      }

      // The doctor signed version N+1 of what they read; refuse if someone else changed it since.
      if (current.version + 1 !== signature.version) {
        throw new AppError(
          409,
          'The profile changed while you were editing. Reload it and try again.',
          'PROFILE_VERSION_CONFLICT'
        );
      }

      const consumed =
        await this.emergencyProfileAccessRequestRepository?.consumeApproved(
          client,
          {
            requestId: approvalRequestId,
            patientUserId,
            doctorUserId,
            operation: 'update'
          }
        );

      if (!consumed) {
        throw approvalRequired(
          'Approved profile-update permission is required.'
        );
      }

      const before = {};
      const after = {};
      const assignments = [];
      const values = [patientUserId];

      for (const [key, column] of Object.entries(PROFILE_COLUMNS)) {
        if (!Object.hasOwn(changes, key)) continue;

        const oldValue = current[column];
        const newValue = changes[key];

        before[key] = oldValue;
        after[key] = newValue;

        values.push(
          ['allergies', 'chronicConditions', 'currentMedications'].includes(key)
            ? JSON.stringify(newValue)
            : newValue
        );

        const position = values.length;
        const json = [
          'allergies',
          'chronicConditions',
          'currentMedications'
        ].includes(key);

        assignments.push(
          `${column} = $${position}${json ? '::jsonb' : ''}`
        );
      }

      if (assignments.length === 0) {
        throw new AppError(
          400,
          'Provide at least one valid field to update.',
          'EMPTY_PROFILE_UPDATE'
        );
      }

      for (const [column, value] of [
        ['version', signature.version],
        ['profile_sha256', signature.profileSha256],
        ['doctor_signature', signature.doctorSignature],
        ['signer_address', signature.signerAddress],
        ['signed_by_doctor_id', doctorUserId]
      ]) {
        values.push(value);
        assignments.push(`${column} = $${values.length}`);
      }

      assignments.push(
        'signed_at = NOW()',
        "blockchain_status = 'pending'",
        'blockchain_tx_hash = NULL',
        'last_reviewed_at = NOW()',
        'updated_at = NOW()'
      );

      await client.query(
        `UPDATE patient_emergency_profiles
         SET ${assignments.join(', ')}
         WHERE patient_user_id = $1`,
        values
      );

      await client.query(
        `INSERT INTO patient_emergency_profile_audit
         (patient_user_id, doctor_user_id, action, changed_fields, change_reason,
          version, profile_sha256, doctor_signature, signer_address)
         VALUES ($1, $2, 'updated', $3::jsonb, $4, $5, $6, $7, $8)`,
        [
          patientUserId,
          doctorUserId,
          JSON.stringify({ previous: before, new: after }),
          reason,
          signature.version,
          signature.profileSha256,
          signature.doctorSignature,
          signature.signerAddress
        ]
      );

      const result = await client.query(
        PROFILE_SELECT,
        [patientUserId]
      );

      return publicProfile(result.rows[0]);
    });
  }

  // Doctor audit-history access also requires a separate one-time
  // view approval, since audit data can contain sensitive details.
  async listAuditForDoctor({
    patientUserId,
    doctorUserId,
    approvalRequestId
  }) {
    return this.database.transaction(async (client) => {
      const consumed =
        await this.emergencyProfileAccessRequestRepository?.consumeApproved(
          client,
          {
            requestId: approvalRequestId,
            patientUserId,
            doctorUserId,
            operation: 'view'
          }
        );

      if (!consumed) {
        throw approvalRequired(
          'Patient approval to view profile audit history is required.'
        );
      }

      const result = await client.query(
        `SELECT id, patient_user_id, doctor_user_id, action,
                changed_fields, change_reason, created_at,
                version, profile_sha256, doctor_signature, signer_address
         FROM patient_emergency_profile_audit
         WHERE patient_user_id = $1
         ORDER BY created_at DESC`,
        [patientUserId]
      );

      return result.rows;
    });
  }

  async markBlockchain(patientUserId, version, { status, transactionHash = null }) {
    await this.database.query(
      `UPDATE patient_emergency_profiles
       SET blockchain_status = $3, blockchain_tx_hash = $4
       WHERE patient_user_id = $1 AND version = $2`,
      [patientUserId, version, status, transactionHash]
    );
  }

  // Retained for existing internal callers. Do not expose this
  // unrestricted method directly through a doctor-facing route.
  async listAudit(patientUserId) {
    const result = await this.database.query(
      `SELECT id, patient_user_id, doctor_user_id, action,
              changed_fields, change_reason, created_at
       FROM patient_emergency_profile_audit
       WHERE patient_user_id = $1
       ORDER BY created_at DESC`,
      [patientUserId]
    );

    return result.rows;
  }
}
