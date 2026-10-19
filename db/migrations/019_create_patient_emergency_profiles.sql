CREATE TABLE IF NOT EXISTS patient_emergency_profiles (
  patient_user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  blood_group VARCHAR(3),
  emergency_contact_name VARCHAR(200),
  emergency_contact_phone VARCHAR(30),
  emergency_contact_relationship VARCHAR(100),

  allergies JSONB NOT NULL DEFAULT '[]'::jsonb,
  allergies_status VARCHAR(20) NOT NULL DEFAULT 'unknown',

  chronic_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  chronic_conditions_status VARCHAR(20) NOT NULL DEFAULT 'unknown',

  current_medications JSONB NOT NULL DEFAULT '[]'::jsonb,
  medications_status VARCHAR(20) NOT NULL DEFAULT 'unknown',

  created_by_doctor_id UUID NOT NULL REFERENCES users(id),
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT emergency_profile_blood_group_check
    CHECK (
      blood_group IS NULL OR
      blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')
    ),

  CONSTRAINT emergency_profile_allergies_status_check
    CHECK (allergies_status IN ('unknown', 'none_known', 'provided')),

  CONSTRAINT emergency_profile_conditions_status_check
    CHECK (chronic_conditions_status IN ('unknown', 'none_known', 'provided')),

  CONSTRAINT emergency_profile_medications_status_check
    CHECK (medications_status IN ('unknown', 'none_known', 'provided')),

  CONSTRAINT emergency_profile_allergies_array_check
    CHECK (jsonb_typeof(allergies) = 'array'),

  CONSTRAINT emergency_profile_conditions_array_check
    CHECK (jsonb_typeof(chronic_conditions) = 'array'),

  CONSTRAINT emergency_profile_medications_array_check
    CHECK (jsonb_typeof(current_medications) = 'array')
);
