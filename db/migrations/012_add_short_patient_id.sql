ALTER TABLE users ADD COLUMN IF NOT EXISTS patient_id VARCHAR(16);

-- Give existing patients a stable short public identifier. UUIDs remain internal.
DO $$
DECLARE r RECORD;
DECLARE candidate TEXT;
BEGIN
  FOR r IN SELECT id FROM users WHERE role = 'patient' AND patient_id IS NULL LOOP
    LOOP
      candidate := 'MV-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE patient_id = candidate);
    END LOOP;
    UPDATE users SET patient_id = candidate WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_patient_id_unique_idx ON users(patient_id) WHERE patient_id IS NOT NULL;
