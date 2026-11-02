-- Terminology (docs/glossary.md §3): coders' invites are links.
ALTER TABLE invites RENAME TO links;
ALTER TABLE links RENAME CONSTRAINT invites_pkey TO links_pkey;
ALTER TABLE links RENAME CONSTRAINT invites_secret_key TO links_secret_key;
ALTER TABLE links RENAME CONSTRAINT invites_job_id_fkey TO links_job_id_fkey;
ALTER INDEX invites_job_key RENAME TO links_job_key;
ALTER TABLE coders RENAME COLUMN invite_id TO link_id;
