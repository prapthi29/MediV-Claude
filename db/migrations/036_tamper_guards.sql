-- Tamper guards. Every insert, update and delete on the app's tables is
-- written to data_change_log, which the API seals into a hash chain and
-- anchors on the blockchain. Deletes are refused, signed and hash columns
-- can only be set once, audit tables are append-only, and writes that do not
-- come through the API (for example from the Supabase table editor) are
-- refused. A database owner can still switch these triggers off; when that
-- happens the DDL is logged and the integrity check reports the gap.

CREATE TABLE IF NOT EXISTS data_change_log (
    id BIGSERIAL PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    db_user TEXT NOT NULL DEFAULT session_user,
    client TEXT,
    application_name TEXT,
    table_name TEXT NOT NULL,
    row_key TEXT,
    operation TEXT NOT NULL CHECK (operation IN ('BASELINE', 'INSERT', 'UPDATE', 'DELETE', 'DDL')),
    row_sha256 TEXT,
    detail TEXT,
    chain_seq BIGINT UNIQUE,
    chain_hash TEXT
);

CREATE INDEX IF NOT EXISTS data_change_log_row_idx ON data_change_log (table_name, row_key, id);
CREATE INDEX IF NOT EXISTS data_change_log_unsealed_idx ON data_change_log (id) WHERE chain_seq IS NULL;

CREATE TABLE IF NOT EXISTS data_change_anchors (
    id BIGSERIAL PRIMARY KEY,
    up_to_seq BIGINT NOT NULL UNIQUE,
    chain_hash TEXT NOT NULL,
    blockchain_record_id TEXT,
    blockchain_tx_hash TEXT,
    anchored_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integrity_checks (
    id BIGSERIAL PRIMARY KEY,
    ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL CHECK (status IN ('ok', 'problems')),
    checked_rows INTEGER NOT NULL DEFAULT 0,
    checked_entries INTEGER NOT NULL DEFAULT 0,
    problems JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- The tables whose rows are logged, compared and protected.
CREATE OR REPLACE FUNCTION mv_guarded_tables() RETURNS TEXT[]
LANGUAGE sql IMMUTABLE AS $$
    SELECT ARRAY[
        'users', 'patient_profiles', 'medical_records', 'medical_record_versions',
        'patient_doctor_consents', 'prescriptions', 'emergency_access_grants',
        'audit_events', 'medical_record_access_requests', 'patient_emergency_profiles',
        'patient_emergency_profile_audit', 'emergency_profile_access_requests',
        'medical_record_creation_approvals', 'medical_record_update_approvals',
        'signing_keys', 'prescription_approvals', 'prescription_shares',
        'prescription_view_requests', 'prescription_dispenses'
    ]::TEXT[]
$$;

-- Time zone is fixed so a row hashes the same from any session.
CREATE OR REPLACE FUNCTION mv_row_sha256(r JSONB) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
    SELECT encode(sha256(convert_to(r::text, 'UTF8')), 'hex')
$$;

CREATE OR REPLACE FUNCTION mv_row_key(r JSONB) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
    SELECT COALESCE(
        r->>'id',
        CASE WHEN r ? 'doctor_user_id' THEN (r->>'patient_user_id') || ':' || (r->>'doctor_user_id') END,
        r->>'patient_user_id'
    )
$$;

-- Current hash of every row of a guarded table.
CREATE OR REPLACE FUNCTION mv_table_row_hashes(tbl TEXT)
RETURNS TABLE (row_key TEXT, row_sha256 TEXT)
LANGUAGE plpgsql STABLE SET timezone = 'UTC' AS $$
BEGIN
    RETURN QUERY EXECUTE format(
        'SELECT mv_row_key(to_jsonb(t)), mv_row_sha256(to_jsonb(t)) FROM public.%I t', tbl
    );
END
$$;

CREATE OR REPLACE FUNCTION mv_log_change() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET timezone = 'UTC' AS $$
DECLARE
    r JSONB := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
BEGIN
    INSERT INTO data_change_log (db_user, client, application_name, table_name, row_key, operation, row_sha256)
    VALUES (
        session_user,
        NULLIF(current_setting('medivault.client', true), ''),
        NULLIF(current_setting('application_name', true), ''),
        TG_TABLE_NAME,
        mv_row_key(r),
        TG_OP,
        mv_row_sha256(r)
    );
    RETURN NULL;
END
$$;

-- Writes must come through the API, which logs, signs and anchors them.
CREATE OR REPLACE FUNCTION mv_require_app_client() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF COALESCE(current_setting('medivault.client', true), '') NOT IN ('api', 'migrate', 'script') THEN
        RAISE EXCEPTION 'MediVault data can only be changed through the MediVault app (% on %).', TG_OP, TG_TABLE_NAME
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;

CREATE OR REPLACE FUNCTION mv_refuse_delete() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    -- A version whose upload never finished registering on chain is the one
    -- row the app removes, to roll back a failed save.
    IF TG_TABLE_NAME = 'medical_record_versions'
       AND to_jsonb(OLD)->>'blockchain_status' IN ('pending', 'failed')
       AND current_setting('medivault.client', true) = 'api' THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION 'Rows in % cannot be deleted. MediVault keeps a permanent record.', TG_TABLE_NAME
        USING ERRCODE = 'insufficient_privilege';
END
$$;

CREATE OR REPLACE FUNCTION mv_refuse_truncate() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% cannot be emptied. MediVault keeps a permanent record.', TG_TABLE_NAME
        USING ERRCODE = 'insufficient_privilege';
END
$$;

CREATE OR REPLACE FUNCTION mv_refuse_update() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Rows in % cannot be changed once written.', TG_TABLE_NAME
        USING ERRCODE = 'insufficient_privilege';
END
$$;

-- TG_ARGV lists columns that may be filled in once and never changed.
CREATE OR REPLACE FUNCTION mv_set_once_columns() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    old_row JSONB := to_jsonb(OLD);
    new_row JSONB := to_jsonb(NEW);
    col TEXT;
BEGIN
    FOREACH col IN ARRAY TG_ARGV LOOP
        IF old_row->col IS NOT NULL AND old_row->col <> 'null'::jsonb
           AND (new_row->col) IS DISTINCT FROM (old_row->col) THEN
            RAISE EXCEPTION 'Column %.% is signed or hashed and cannot be changed.', TG_TABLE_NAME, col
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END LOOP;
    RETURN NEW;
END
$$;

-- Baseline: one entry for each row whose current state is not the last one
-- logged, so later checks can tell a row that was removed or rewritten while
-- the guards were off. Migrations run this again after they change tables
-- (a new column changes every row's hash).
CREATE OR REPLACE FUNCTION mv_rebaseline() RETURNS INTEGER
LANGUAGE plpgsql SET timezone = 'UTC' AS $$
DECLARE
    added INTEGER;
BEGIN
    WITH cur AS (
        SELECT t.tbl, h.row_key, h.row_sha256
        FROM unnest(mv_guarded_tables()) AS t(tbl)
        CROSS JOIN LATERAL mv_table_row_hashes(t.tbl) h
    ), last AS (
        SELECT DISTINCT ON (table_name, row_key) table_name, row_key, operation, row_sha256
        FROM data_change_log WHERE operation <> 'DDL'
        ORDER BY table_name, row_key, id DESC
    )
    INSERT INTO data_change_log (client, application_name, table_name, row_key, operation, row_sha256)
    SELECT 'migrate', current_setting('application_name', true), cur.tbl, cur.row_key, 'BASELINE', cur.row_sha256
    FROM cur
    LEFT JOIN last ON last.table_name = cur.tbl AND last.row_key = cur.row_key
    WHERE last.row_key IS NULL OR last.operation = 'DELETE' OR last.row_sha256 IS DISTINCT FROM cur.row_sha256;
    GET DIAGNOSTICS added = ROW_COUNT;
    RETURN added;
END
$$;

SELECT mv_rebaseline();
REVOKE EXECUTE ON FUNCTION mv_rebaseline() FROM PUBLIC;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY mv_guarded_tables() LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS mv_00_require_app ON %I', tbl);
        EXECUTE format('CREATE TRIGGER mv_00_require_app BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION mv_require_app_client()', tbl);
        EXECUTE format('DROP TRIGGER IF EXISTS mv_10_refuse_delete ON %I', tbl);
        EXECUTE format('CREATE TRIGGER mv_10_refuse_delete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION mv_refuse_delete()', tbl);
        EXECUTE format('DROP TRIGGER IF EXISTS mv_10_refuse_truncate ON %I', tbl);
        EXECUTE format('CREATE TRIGGER mv_10_refuse_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION mv_refuse_truncate()', tbl);
        EXECUTE format('DROP TRIGGER IF EXISTS mv_90_log_change ON %I', tbl);
        EXECUTE format('CREATE TRIGGER mv_90_log_change AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION mv_log_change()', tbl);
    END LOOP;

    -- Append-only tables.
    FOREACH tbl IN ARRAY ARRAY['audit_events', 'patient_emergency_profile_audit', 'prescription_dispenses'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS mv_20_refuse_update ON %I', tbl);
        EXECUTE format('CREATE TRIGGER mv_20_refuse_update BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION mv_refuse_update()', tbl);
    END LOOP;

    -- The log tables guard themselves: no deletes, no edits.
    FOREACH tbl IN ARRAY ARRAY['data_change_log', 'data_change_anchors', 'integrity_checks'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS mv_00_require_app ON %I', tbl);
        EXECUTE format('CREATE TRIGGER mv_00_require_app BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION mv_require_app_client()', tbl);
        EXECUTE format('DROP TRIGGER IF EXISTS mv_10_refuse_delete ON %I', tbl);
        EXECUTE format('CREATE TRIGGER mv_10_refuse_delete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION mv_refuse_delete()', tbl);
        EXECUTE format('DROP TRIGGER IF EXISTS mv_10_refuse_truncate ON %I', tbl);
        EXECUTE format('CREATE TRIGGER mv_10_refuse_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION mv_refuse_truncate()', tbl);
    END LOOP;
    DROP TRIGGER IF EXISTS mv_20_refuse_update ON data_change_anchors;
    CREATE TRIGGER mv_20_refuse_update BEFORE UPDATE ON data_change_anchors FOR EACH ROW EXECUTE FUNCTION mv_refuse_update();
    DROP TRIGGER IF EXISTS mv_20_refuse_update ON integrity_checks;
    CREATE TRIGGER mv_20_refuse_update BEFORE UPDATE ON integrity_checks FOR EACH ROW EXECUTE FUNCTION mv_refuse_update();
END
$$;

-- Only the chain columns of a log entry are filled in later, once.
DROP TRIGGER IF EXISTS mv_20_set_once ON data_change_log;
CREATE TRIGGER mv_20_set_once BEFORE UPDATE ON data_change_log FOR EACH ROW EXECUTE FUNCTION mv_set_once_columns(
    'chain_seq', 'chain_hash');
CREATE OR REPLACE FUNCTION mv_log_entry_fixed() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF to_jsonb(NEW) - 'chain_seq' - 'chain_hash' IS DISTINCT FROM to_jsonb(OLD) - 'chain_seq' - 'chain_hash' THEN
        RAISE EXCEPTION 'Change log entries cannot be changed.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS mv_21_fixed ON data_change_log;
CREATE TRIGGER mv_21_fixed BEFORE UPDATE ON data_change_log FOR EACH ROW EXECUTE FUNCTION mv_log_entry_fixed();

-- Signed, hashed and encrypted columns.
DROP TRIGGER IF EXISTS mv_20_set_once ON medical_records;
CREATE TRIGGER mv_20_set_once BEFORE UPDATE ON medical_records FOR EACH ROW EXECUTE FUNCTION mv_set_once_columns(
    'id', 'patient_user_id', 'uploaded_by_user_id', 'blockchain_record_id', 'blockchain_tx_hash', 'created_at');

DROP TRIGGER IF EXISTS mv_20_set_once ON medical_record_versions;
CREATE TRIGGER mv_20_set_once BEFORE UPDATE ON medical_record_versions FOR EACH ROW EXECUTE FUNCTION mv_set_once_columns(
    'id', 'medical_record_id', 'version_number', 'uploaded_by_user_id', 'storage_key', 'original_filename',
    'content_type', 'size_bytes', 'title', 'category', 'content_sha256', 'encryption_algorithm',
    'encrypted_data_key', 'data_key_iv', 'data_key_auth_tag', 'file_iv', 'file_auth_tag',
    'blockchain_tx_hash', 'created_at', 'doctor_signature', 'signer_address');

DROP TRIGGER IF EXISTS mv_20_set_once ON prescriptions;
CREATE TRIGGER mv_20_set_once BEFORE UPDATE ON prescriptions FOR EACH ROW EXECUTE FUNCTION mv_set_once_columns(
    'id', 'patient_user_id', 'doctor_user_id', 'storage_key', 'original_filename', 'content_type',
    'size_bytes', 'title', 'content_sha256', 'doctor_signature', 'encryption_algorithm',
    'encrypted_data_key', 'data_key_iv', 'data_key_auth_tag', 'file_iv', 'file_auth_tag',
    'blockchain_record_id', 'blockchain_tx_hash', 'created_at', 'signer_address', 'format',
    'medications_sha256', 'clinical_sha256', 'approval_id', 'dispensed_at', 'dispensed_by_user_id',
    'dispense_signature', 'dispense_signer_address', 'follow_up_date');

DROP TRIGGER IF EXISTS mv_20_set_once ON emergency_access_grants;
CREATE TRIGGER mv_20_set_once BEFORE UPDATE ON emergency_access_grants FOR EACH ROW EXECUTE FUNCTION mv_set_once_columns(
    'id', 'patient_user_id', 'doctor_user_id', 'reason', 'expires_at', 'revoked_at', 'blockchain_tx_hash',
    'created_at', 'duration_minutes', 'request_payload', 'request_sha256', 'doctor_signature',
    'signer_address', 'revoked_by_user_id');

DROP TRIGGER IF EXISTS mv_20_set_once ON signing_keys;
CREATE TRIGGER mv_20_set_once BEFORE UPDATE ON signing_keys FOR EACH ROW EXECUTE FUNCTION mv_set_once_columns(
    'id', 'user_id', 'address', 'encrypted_private_key', 'kdf_salt', 'key_iv', 'key_auth_tag', 'created_at', 'retired_at');

DROP TRIGGER IF EXISTS mv_20_set_once ON users;
CREATE TRIGGER mv_20_set_once BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION mv_set_once_columns(
    'id', 'role', 'created_at', 'patient_id');

-- Encrypted files in Supabase Storage: a file that a record or prescription
-- points to cannot be deleted, moved or overwritten. Files left over from a
-- failed upload (no row points to them) can still be cleaned up.
DO $outer$
BEGIN
    IF to_regclass('storage.objects') IS NULL THEN
        RAISE NOTICE 'No Supabase storage schema here; skipping the storage guard.';
        RETURN;
    END IF;

    EXECUTE $fn$
        CREATE OR REPLACE FUNCTION public.mv_protect_medical_file() RETURNS TRIGGER
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $body$
        BEGIN
            -- Storage itself updates bookkeeping columns; only a rename, a
            -- move or a new upload over the file counts as a change.
            IF TG_OP = 'UPDATE'
               AND to_jsonb(NEW)->'name' IS NOT DISTINCT FROM to_jsonb(OLD)->'name'
               AND to_jsonb(NEW)->'bucket_id' IS NOT DISTINCT FROM to_jsonb(OLD)->'bucket_id'
               AND to_jsonb(NEW)->'version' IS NOT DISTINCT FROM to_jsonb(OLD)->'version' THEN
                RETURN NEW;
            END IF;

            IF EXISTS (SELECT 1 FROM public.medical_records WHERE storage_key = OLD.name)
               OR EXISTS (SELECT 1 FROM public.medical_record_versions WHERE storage_key = OLD.name)
               OR EXISTS (SELECT 1 FROM public.prescriptions WHERE storage_key = OLD.name) THEN
                RAISE EXCEPTION 'This file belongs to a MediVault record and cannot be deleted or changed.'
                    USING ERRCODE = 'insufficient_privilege';
            END IF;
            RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        END
        $body$
    $fn$;

    EXECUTE 'DROP TRIGGER IF EXISTS mv_protect_medical_file ON storage.objects';
    EXECUTE 'CREATE TRIGGER mv_protect_medical_file BEFORE UPDATE OR DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.mv_protect_medical_file()';
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Could not add the storage guard: %', SQLERRM;
END
$outer$;

-- Log schema changes (for example a trigger being switched off).
CREATE OR REPLACE FUNCTION mv_log_ddl() RETURNS EVENT_TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    cmd RECORD;
BEGIN
    FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
        IF cmd.schema_name IS NULL OR cmd.schema_name IN ('public', 'storage') THEN
            INSERT INTO data_change_log (db_user, client, application_name, table_name, row_key, operation, detail)
            VALUES (
                session_user,
                NULLIF(current_setting('medivault.client', true), ''),
                NULLIF(current_setting('application_name', true), ''),
                COALESCE(cmd.object_identity, '?'),
                NULL,
                'DDL',
                cmd.command_tag
            );
        END IF;
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION mv_log_drop() RETURNS EVENT_TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    obj RECORD;
BEGIN
    FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects() LOOP
        IF obj.schema_name IN ('public', 'storage') AND obj.original THEN
            INSERT INTO data_change_log (db_user, client, application_name, table_name, row_key, operation, detail)
            VALUES (
                session_user,
                NULLIF(current_setting('medivault.client', true), ''),
                NULLIF(current_setting('application_name', true), ''),
                COALESCE(obj.object_identity, '?'),
                NULL,
                'DDL',
                'DROP ' || upper(obj.object_type)
            );
        END IF;
    END LOOP;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'mv_log_ddl') THEN
        CREATE EVENT TRIGGER mv_log_ddl ON ddl_command_end EXECUTE FUNCTION mv_log_ddl();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'mv_log_drop') THEN
        CREATE EVENT TRIGGER mv_log_drop ON sql_drop EXECUTE FUNCTION mv_log_drop();
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Could not add the schema change log: %', SQLERRM;
END
$$;

-- No leaks through Supabase's public API: the anon and authenticated keys
-- get no access to these tables, and row level security (with no policies
-- for them) blocks them even if access is granted again later.
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    END LOOP;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
        REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
        REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Could not lock down the public API roles: %', SQLERRM;
END
$$;

-- A restricted login for the API: it can read, add and update rows, but it
-- cannot delete, empty tables, change the schema or switch triggers off.
-- It has no password until one is set by hand (see CLOUD_DEPLOYMENT.md).
DO $$
DECLARE
    tbl TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medivault_app') THEN
        CREATE ROLE medivault_app NOLOGIN;
    END IF;

    GRANT USAGE ON SCHEMA public TO medivault_app;
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO medivault_app;
    GRANT DELETE ON medical_record_versions TO medivault_app;
    REVOKE ALL ON schema_migrations FROM medivault_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO medivault_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO medivault_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO medivault_app;

    FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations' LOOP
        EXECUTE format('DROP POLICY IF EXISTS medivault_app_all ON public.%I', tbl);
        EXECUTE format('CREATE POLICY medivault_app_all ON public.%I TO medivault_app USING (true) WITH CHECK (true)', tbl);
    END LOOP;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Could not set up the restricted app role: %', SQLERRM;
END
$$;
