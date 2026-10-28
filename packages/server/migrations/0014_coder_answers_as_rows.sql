-- Answers outside unit loops (survey questions, and values the server
-- assigns: invite presets, random or balanced groups, URL parameters) are
-- rows of annotation_values too, without a unit, instead of a JSON object
-- on the coder: one answer is one row, with the same timestamps, versions
-- and device. `assigned`: set by the server, not answered.
ALTER TABLE annotation_values ALTER COLUMN unit_id DROP NOT NULL;
ALTER TABLE annotation_values ADD COLUMN assigned BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX annotation_values_coder_live ON annotation_values (coder_id, variable) WHERE retired_at IS NULL AND unit_id IS NULL;
ALTER TABLE coders DROP COLUMN variables;
