-- The unit fields belong to the design (docs/plans/design.md §3): each
-- codebook version has its `units` (contracts UnitsSpecSchema), the job's
-- one specification of its unit fields. Uploads write the draft's.
ALTER TABLE codebooks ADD COLUMN units JSONB NOT NULL DEFAULT '{"fields": []}';
UPDATE codebooks c SET units = jsonb_build_object('fields', COALESCE(
  (SELECT jsonb_agg(jsonb_build_object('name', f.name, 'type', f.type) ORDER BY f.position) FROM unit_fields f WHERE f.job_id = c.job_id),
  '[]'::jsonb));
DROP TABLE unit_fields;
