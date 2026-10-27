-- The unitset coders of an invite code in unit loops with mode
-- "invitation" (contracts CoderInviteWriteSchema `unitsetId`). A unitset an
-- invite uses can't be deleted (the researcher API refuses).
ALTER TABLE invites ADD COLUMN unitset_id INTEGER REFERENCES unitsets (id);
