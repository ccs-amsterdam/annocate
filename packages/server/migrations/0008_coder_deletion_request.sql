-- A coder's request to delete their answers: { at, declinedAt? }. The
-- researcher deletes the coder (and so the request) or declines it.
ALTER TABLE coders ADD COLUMN deletion_request JSONB;
