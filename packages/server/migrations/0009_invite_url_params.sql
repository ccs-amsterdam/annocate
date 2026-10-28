-- URL parameters of invitation links (docs/coder-identity.md §3): where
-- the participant id comes from ({ param, pattern? }, replacing the
-- `participant` parameter), and other required parameters
-- ([{ param, name?, pattern? }]), stored per coder by their `$session` name.
ALTER TABLE invites DROP COLUMN participant_from_url;
ALTER TABLE invites ADD COLUMN participant_param JSONB;
ALTER TABLE invites ADD COLUMN url_params JSONB;
ALTER TABLE coders ADD COLUMN session JSONB NOT NULL DEFAULT '{}';
