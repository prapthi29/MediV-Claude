CREATE OR REPLACE FUNCTION assign_patient_public_id() RETURNS trigger AS $$
DECLARE candidate TEXT;
BEGIN
  IF NEW.role = 'patient' AND NEW.patient_id IS NULL THEN
    LOOP
      candidate := 'MV-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE patient_id = candidate);
    END LOOP;
    NEW.patient_id := candidate;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_assign_patient_id ON users;
CREATE TRIGGER users_assign_patient_id BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION assign_patient_public_id();
