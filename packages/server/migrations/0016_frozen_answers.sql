-- Frozen coder-level answers (docs/plan-stateless-runtime.md §4): an answer a
-- unit loop depends on can't change once the coder coded a unit there.
ALTER TABLE annotation_values ADD COLUMN frozen BOOLEAN NOT NULL DEFAULT false;
