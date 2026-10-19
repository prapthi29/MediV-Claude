import { AppError } from '../utils/app-error.js';

const PROFILE_COLUMNS = {
  bloodGroup: 'blood_group',
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

function publicProfile(row) {
  if (!row) return null;

  return {
    patientUserId: row.patient_user_id,
    patientName: row.patient_name,
    patientId: row.patient_id,
    medicalRecordStatus: row.medical_record_status,
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
      `SELECT p.*, u.name AS patient_name, u.patient_id,
              u.medical_record_status
       FROM patient_emergency_profiles p
       JOIN users u ON u.id = p.patient_user_id
       WHERE p.patient_user_id = $1`,
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
        `SELECT p.*, u.name AS patient_name, u.patient_id,
                u.medical_record_status
         FROM patient_emergency_profiles p
         JOIN users u ON u.id = p.patient_user_id
         WHERE p.patient_user_id = $1`,
        [patientUserId]
      );

      if (!profileResult.rows[0]) {
        throw new AppError(
          404,
          'Emergency medical profile not found.',
          'EMERGENCY_PROFILE_NOT_FOUND'
        );
      }

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
          'Patient approval to view the emergency profile is required.'
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
    approvalRequestId
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
          'Emergency profile already exists. Use the update operation.',
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
           last_reviewed_at
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6::jsonb, $7, $8::jsonb, $9,
           $10::jsonb, $11, $12, NOW()
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
          doctorUserId
        ]
      );

      await client.query(
        `INSERT INTO patient_emergency_profile_audit
         (patient_user_id, doctor_user_id, action, changed_fields, change_reason)
         VALUES ($1, $2, 'created', $3::jsonb, $4)`,
        [
          patientUserId,
          doctorUserId,
          JSON.stringify({
            profile: { previous: null, new: profile }
          }),
          reason
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
        `SELECT p.*, u.name AS patient_name, u.patient_id,
                u.medical_record_status
         FROM patient_emergency_profiles p
         JOIN users u ON u.id = p.patient_user_id
         WHERE p.patient_user_id = $1`,
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
    approvalRequestId
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
          'Create the initial emergency profile first.',
          'EMERGENCY_PROFILE_NOT_FOUND'
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

      assignments.push('last_reviewed_at = NOW()', 'updated_at = NOW()');

      await client.query(
        `UPDATE patient_emergency_profiles
         SET ${assignments.join(', ')}
         WHERE patient_user_id = $1`,
        values
      );

      await client.query(
        `INSERT INTO patient_emergency_profile_audit
         (patient_user_id, doctor_user_id, action, changed_fields, change_reason)
         VALUES ($1, $2, 'updated', $3::jsonb, $4)`,
        [
          patientUserId,
          doctorUserId,
          JSON.stringify({ previous: before, new: after }),
          reason
        ]
      );

      const result = await client.query(
        `SELECT p.*, u.name AS patient_name, u.patient_id,
                u.medical_record_status
         FROM patient_emergency_profiles p
         JOIN users u ON u.id = p.patient_user_id
         WHERE p.patient_user_id = $1`,
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
                changed_fields, change_reason, created_at
         FROM patient_emergency_profile_audit
         WHERE patient_user_id = $1
         ORDER BY created_at DESC`,
        [patientUserId]
      );

      return result.rows;
    });
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
