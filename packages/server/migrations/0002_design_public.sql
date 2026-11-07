-- A design's public info (what coders see about a study, its title) is its own
-- key next to the session; the session is always there (no parameters: an
-- empty list).
ALTER TABLE design_versions ADD COLUMN public JSONB;
UPDATE design_versions SET session = '{"params": []}' WHERE session IS NULL;
ALTER TABLE design_versions ALTER COLUMN session SET DEFAULT '{"params": []}';
ALTER TABLE design_versions ALTER COLUMN session SET NOT NULL;
