-- Finished sessions are closed by default (docs/coder-identity.md §9): a
-- coder can't look at or change their answers once they ended, apart from
-- going back within a few minutes after finishing. A job can keep them open.
ALTER TABLE jobs ADD COLUMN keep_sessions_open BOOLEAN NOT NULL DEFAULT false;
