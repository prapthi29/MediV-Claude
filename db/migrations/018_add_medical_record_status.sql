ALTER TABLE users
ADD COLUMN IF NOT EXISTS medical_record_status VARCHAR(20)
NOT NULL DEFAULT 'pending'
CHECK (medical_record_status IN ('pending', 'active'));