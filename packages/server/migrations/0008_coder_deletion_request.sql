-- A coder's request to delete their answers: { at, declinedAt? }. The
-- researcher deletes the coder now or later.
ALTER TABLE coders ADD COLUMN deletion_request JSONB;
