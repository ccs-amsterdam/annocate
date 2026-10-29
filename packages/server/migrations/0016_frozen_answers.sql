-- Frozen coder-level answers (docs/architecture.md §7): an answer a
-- unit loop depends on can't change once the coder coded a unit there.
ALTER TABLE annotation_values ADD COLUMN frozen BOOLEAN NOT NULL DEFAULT false;
