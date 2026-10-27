-- Drafts are saved by researchers in turn: who saved last, when, and a
-- revision that a save refers to, so a save can't silently overwrite
-- someone else's (409 codebook_conflict).
ALTER TABLE codebooks
  ADD COLUMN updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN updated_by TEXT,
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
UPDATE codebooks SET updated = created;
