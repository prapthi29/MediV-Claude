import { AppError } from '../utils/app-error.js';

export class PatientProfileService {
  constructor({ patientProfileRepository }) {
    this.patientProfileRepository = patientProfileRepository;
  }

  async getOwnProfile(patientUserId) {
    const profile = await this.patientProfileRepository.findByPatientId(patientUserId);
    if (!profile) throw new AppError(404, 'Patient profile not found.', 'PROFILE_NOT_FOUND');
    return this.publicProfile(profile);
  }

  async createOwnProfile(patientUserId, input) {
    const existing = await this.patientProfileRepository.findByPatientId(patientUserId);
    if (existing) throw new AppError(409, 'Patient profile already exists.', 'PROFILE_EXISTS');
    return this.publicProfile(await this.patientProfileRepository.create(patientUserId, input));
  }

  async updateOwnProfile(patientUserId, input) {
    const profile = await this.patientProfileRepository.update(patientUserId, input);
    if (!profile) throw new AppError(404, 'Patient profile not found.', 'PROFILE_NOT_FOUND');
    return this.publicProfile(profile);
  }

  publicProfile(profile) {
    return {
      patientUserId: profile.patient_user_id,
      firstName: profile.first_name,
      lastName: profile.last_name,
      dateOfBirth: profile.date_of_birth,
      phone: profile.phone,
      address: profile.address,
      bloodType: profile.blood_type,
      allergies: profile.allergies,
      emergencyContact: {
        name: profile.emergency_contact_name,
        phone: profile.emergency_contact_phone,
        relationship: profile.emergency_contact_relationship
      },
      createdAt: profile.created_at,
      updatedAt: profile.updated_at
    };
  }
}
