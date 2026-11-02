-- Terminology (docs/glossary.md §3): coders' invites are links.
ALTER TABLE invites RENAME TO links;
ALTER INDEX invites_job_key RENAME TO links_job_key;
ALTER TABLE coders RENAME COLUMN invite_id TO link_id;
-- Constraint names follow the table (invites_pkey, invites_secret_key, ...)
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'links'::regclass AND conname LIKE 'invites\_%' LOOP
    EXECUTE format('ALTER TABLE links RENAME CONSTRAINT %I TO %I', c.conname, 'links_' || substr(c.conname, 9));
  END LOOP;
END $$;
