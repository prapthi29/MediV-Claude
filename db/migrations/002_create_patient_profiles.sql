CREATE TABLE IF NOT EXISTS patient_profiles (
  patient_user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  date_of_birth DATE NOT NULL,
  phone VARCHAR(30),
  address TEXT,
  blood_type VARCHAR(3),
  allergies TEXT,
  emergency_contact_name VARCHAR(200),
  emergency_contact_phone VARCHAR(30),
  emergency_contact_relationship VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patient_profiles_birth_date_check CHECK (date_of_birth <= CURRENT_DATE),
  CONSTRAINT patient_profiles_blood_type_check CHECK (
    blood_type IS NULL OR blood_type IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')
  )
);
