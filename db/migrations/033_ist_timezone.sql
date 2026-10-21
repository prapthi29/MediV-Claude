-- Show times in India Standard Time. Times are stored as TIMESTAMPTZ, so
-- this changes how they are displayed (for example in the Supabase table
-- editor), not the moments they record. If the database role may not change
-- the setting, the app still sets IST on each of its own connections.
DO $$
BEGIN
    EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'Asia/Kolkata');
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not set the database time zone; the app sets it per connection.';
END
$$;
