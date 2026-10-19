import { AppError } from '../utils/app-error.js';

// A patient's account is usable for clinical work only after a doctor has created
// and signed their basic profile (users.medical_record_status = 'active').
export async function assertProfileActive(userRepository, patientUserId) {
  const patient = await userRepository.findById(patientUserId);

  if (!patient || patient.role !== 'patient') {
    throw new AppError(404, 'Patient account not found.', 'PATIENT_NOT_FOUND');
  }

  if (patient.medical_record_status !== 'active') {
    throw new AppError(
      409,
      "This patient's basic profile has not been created yet. A doctor must create and sign it first.",
      'PROFILE_NOT_ACTIVE'
    );
  }

  return patient;
}
