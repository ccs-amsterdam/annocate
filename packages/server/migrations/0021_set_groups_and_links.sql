-- Set groups (docs/plans/sets-and-session-parameters.md §1): a unit's sets
-- per group, with an optional position. Replaces `unitsets`; each old
-- unitset becomes a set of the group `unitsets`, in its order.
CREATE TABLE unit_sets (
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  grp TEXT NOT NULL,
  set_name TEXT NOT NULL,
  unit_id INTEGER NOT NULL REFERENCES units (id) ON DELETE CASCADE,
  position INTEGER, -- NULL: the set is in the units' order
  PRIMARY KEY (job_id, grp, set_name, unit_id)
);
CREATE INDEX unit_sets_unit ON unit_sets (unit_id);

INSERT INTO unit_sets (job_id, grp, set_name, unit_id, position)
SELECT s.job_id, 'unitsets', s.name, x.unit_id, x.ord
FROM unitsets s, unnest(s.unit_ids) WITH ORDINALITY AS x (unit_id, ord)
WHERE EXISTS (SELECT 1 FROM units u WHERE u.id = x.unit_id AND u.job_id = s.job_id)
ON CONFLICT DO NOTHING;

ALTER TABLE invites DROP COLUMN unitset_id;
DROP TABLE unitsets;

-- Links are generated from the published codebook's link parameters (§4):
-- `params` are the values a link carries, `link_key` their canonical form
-- (contracts `linkKey`), `retired_at` set when the design no longer makes
-- the link. Per-link URL parameters, participant parameter and presets for
-- `auto` variables moved into the codebook (the Session item).
ALTER TABLE invites ADD COLUMN params JSONB NOT NULL DEFAULT '{}';
ALTER TABLE invites ADD COLUMN link_key TEXT NOT NULL DEFAULT '[]';
ALTER TABLE invites ADD COLUMN retired_at TIMESTAMPTZ;
ALTER TABLE invites DROP COLUMN variables;
ALTER TABLE invites DROP COLUMN participant_param;
ALTER TABLE invites DROP COLUMN url_params;
CREATE INDEX invites_job_key ON invites (job_id, link_key);
