import { describe, expect, it } from 'vitest';
import { EmergencyAccessService } from '../src/services/emergency-access-service.js';

class Grants {
  constructor() { this.grant = null; }
  async create(input) {
    this.grant = { id: 'd0aa0000-0000-4000-8000-000000000012', patient_user_id: input.patientUserId, doctor_user_id: input.doctorUserId, reason: input.reason, expires_at: input.expiresAt, created_at: new Date(), revoked_at: null };
    return this.grant;
  }
  async findActive(patientId, doctorId) {
    return this.grant && this.grant.patient_user_id === patientId && this.grant.doctor_user_id === doctorId && !this.grant.revoked_at && this.grant.expires_at > new Date() ? this.grant : null;
  }
}

describe('emergency access service', () => {
  it('limits access to essential records and writes audits', async () => {
    const events = [];
    const service = new EmergencyAccessService({
      emergencyAccessRepository: new Grants(),
      userRepository: { findById: async (id) => id === 'doctor' ? { role: 'doctor' } : { role: 'patient' } },
      medicalRecordRepository: { listEssentialForPatient: async () => [{ id: 'record-1', title: 'Allergies', is_emergency_essential: true }] },
      auditService: { record: async (event) => events.push(event) }
    });
    const access = await service.grant('doctor', 'patient', 'Unconscious following an accident', new Date(Date.now() + 30 * 60 * 1000));
    expect(access.doctorUserId).toBe('doctor');
    await expect(service.listEssentialRecords('doctor', 'patient')).resolves.toEqual([{ id: 'record-1', title: 'Allergies', is_emergency_essential: true }]);
    expect(events.map((event) => event.eventType)).toEqual(['emergency_access_granted', 'emergency_records_accessed']);
  });

  it('rejects access past the controlled one-hour maximum', async () => {
    const service = new EmergencyAccessService({
      emergencyAccessRepository: new Grants(),
      userRepository: { findById: async (id) => ({ role: id === 'doctor' ? 'doctor' : 'patient' }) },
      medicalRecordRepository: {}, auditService: { record: async () => {} }
    });
    await expect(service.grant('doctor', 'patient', 'Unconscious following an accident', new Date(Date.now() + 61 * 60 * 1000)))
      .rejects.toMatchObject({ code: 'INVALID_EMERGENCY_EXPIRY' });
  });
});
