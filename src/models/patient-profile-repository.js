export class PatientProfileRepository {
  constructor(database) {
    this.database = database;
  }

  async findByPatientId(patientUserId) {
    const result = await this.database.query(
      `SELECT patient_user_id, first_name, last_name, date_of_birth, phone, address, blood_type,
              allergies, emergency_contact_name, emergency_contact_phone,
              emergency_contact_relationship, created_at, updated_at
       FROM patient_profiles WHERE patient_user_id = $1`,
      [patientUserId]
    );
    return result.rows[0] ?? null;
  }

  async create(patientUserId, profile) {
    const result = await this.database.query(
      `INSERT INTO patient_profiles (
         patient_user_id, first_name, last_name, date_of_birth, phone, address, blood_type,
         allergies, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [patientUserId, profile.firstName, profile.lastName, profile.dateOfBirth, profile.phone,
        profile.address, profile.bloodType, profile.allergies, profile.emergencyContactName,
        profile.emergencyContactPhone, profile.emergencyContactRelationship]
    );
    return result.rows[0];
  }

  async update(patientUserId, profile) {
    const columns = {
      firstName: 'first_name', lastName: 'last_name', dateOfBirth: 'date_of_birth', phone: 'phone',
      address: 'address', bloodType: 'blood_type', allergies: 'allergies',
      emergencyContactName: 'emergency_contact_name', emergencyContactPhone: 'emergency_contact_phone',
      emergencyContactRelationship: 'emergency_contact_relationship'
    };
    const entries = Object.entries(profile).filter(([, value]) => value !== undefined);
    const assignments = entries.map(([key], index) => `${columns[key]} = $${index + 2}`);
    const values = [patientUserId, ...entries.map(([, value]) => value)];
    const result = await this.database.query(
      `UPDATE patient_profiles SET ${assignments.join(', ')}, updated_at = NOW()
       WHERE patient_user_id = $1 RETURNING *`,
      values
    );
    return result.rows[0] ?? null;
  }
}
