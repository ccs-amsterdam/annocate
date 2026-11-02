-- Terminology (docs/glossary.md §3): the versions of a job's design.
ALTER TABLE codebooks RENAME TO design_versions;
ALTER INDEX codebooks_job RENAME TO design_versions_job;
ALTER TABLE deployments RENAME COLUMN codebook_id TO design_version_id;
ALTER TABLE deployment_versions RENAME COLUMN codebook_id TO design_version_id;
ALTER TABLE annotation_values RENAME COLUMN codebook_id TO design_version_id;
-- Constraint names follow the tables and columns
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT conrelid::regclass::text AS t, conname FROM pg_constraint
    WHERE conname LIKE 'codebooks\_%' OR conname LIKE '%\_codebook\_id\_%' LOOP
    EXECUTE format('ALTER TABLE %I RENAME CONSTRAINT %I TO %I', c.t, c.conname,
      replace(replace(c.conname, 'codebooks_', 'design_versions_'), '_codebook_id_', '_design_version_id_'));
  END LOOP;
END $$;
