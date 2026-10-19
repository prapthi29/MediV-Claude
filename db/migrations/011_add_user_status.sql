DO $$
BEGIN
  CREATE TYPE user_status AS ENUM ('active', 'pending', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS status user_status NOT NULL DEFAULT 'active';
