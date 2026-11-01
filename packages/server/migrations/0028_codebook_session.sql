-- The session belongs to the design next to the items, not among them
-- (docs/plans/design.md §2): each codebook's Session item moves to `session`.
ALTER TABLE codebooks ADD COLUMN session JSONB;
UPDATE codebooks SET
  session = (SELECT e - 'type' FROM jsonb_array_elements(items) e WHERE e ->> 'type' = 'session' LIMIT 1),
  items = COALESCE((SELECT jsonb_agg(e ORDER BY n) FROM jsonb_array_elements(items) WITH ORDINALITY AS t (e, n)
                    WHERE e ->> 'type' IS DISTINCT FROM 'session'), '[]'::jsonb)
WHERE jsonb_typeof(items) = 'array';
