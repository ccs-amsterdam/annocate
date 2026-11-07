-- Terminology (docs/glossary.md): a researcher runs a study, not a job.
-- Renames every table, column, constraint, index and sequence named after
-- "job" to "study" (jobs -> studies, job_users -> study_users, job_id ->
-- study_id, ...), from what the catalog holds, so it works whichever
-- constraints the server names (Postgres 17 also names NOT NULL ones).
DO $$
DECLARE
  r record;
BEGIN
  -- Columns first (their tables keep their names until below)
  FOR r IN SELECT c.table_name, c.column_name FROM information_schema.columns c
           WHERE c.table_schema = 'public' AND c.column_name LIKE '%job%' LOOP
    EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', r.table_name, r.column_name, replace(r.column_name, 'job', 'study'));
  END LOOP;
  FOR r IN SELECT conrelid::regclass::text AS tbl, conname FROM pg_constraint
           WHERE connamespace = 'public'::regnamespace AND conname LIKE '%job%' LOOP
    EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I', r.tbl, r.conname, replace(replace(r.conname, 'jobs', 'studies'), 'job', 'study'));
  END LOOP;
  FOR r IN SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE '%job%' LOOP
    EXECUTE format('ALTER INDEX %I RENAME TO %I', r.indexname, replace(replace(r.indexname, 'jobs', 'studies'), 'job', 'study'));
  END LOOP;
  FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' AND sequencename LIKE '%job%' LOOP
    EXECUTE format('ALTER SEQUENCE %I RENAME TO %I', r.sequencename, replace(replace(r.sequencename, 'jobs', 'studies'), 'job', 'study'));
  END LOOP;
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE '%job%' LOOP
    EXECUTE format('ALTER TABLE %I RENAME TO %I', r.tablename, replace(replace(r.tablename, 'jobs', 'studies'), 'job', 'study'));
  END LOOP;
END $$;

-- Plan limits and per-user overrides: jobs -> studies, unitsPerJob -> unitsPerStudy, ...
UPDATE plans SET limits = COALESCE(
  (SELECT jsonb_object_agg(CASE WHEN k = 'jobs' THEN 'studies' ELSE replace(k, 'Job', 'Study') END, v) FROM jsonb_each(limits) AS e(k, v)),
  '{}');
UPDATE users SET limits = COALESCE(
  (SELECT jsonb_object_agg(CASE WHEN k = 'jobs' THEN 'studies' ELSE replace(k, 'Job', 'Study') END, v) FROM jsonb_each(limits) AS e(k, v)),
  '{}')
WHERE limits IS NOT NULL;
