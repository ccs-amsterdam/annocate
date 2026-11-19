-- Unit assignment (docs/plans/unit-assignment.md): who gets which units is
-- decided per session (the coder column, conditions linked to set columns),
-- and whether coders sign in is a setting of the study, not of a link.
ALTER TABLE studies ADD COLUMN sign_in TEXT NOT NULL DEFAULT 'off' CHECK (sign_in IN ('off', 'optional', 'required'));
ALTER TABLE links DROP COLUMN auth;
ALTER TABLE links DROP COLUMN emails;
-- Routings were stored by the old loop modes: coders are routed again.
UPDATE coders SET assignments = '{}';
