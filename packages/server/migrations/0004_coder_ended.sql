-- A coder whose session ended at an `end` item (screened out or complete):
-- { item, outcome, at }. Null while the session is open.
ALTER TABLE coders ADD COLUMN ended JSONB;
