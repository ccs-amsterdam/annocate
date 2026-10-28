-- Coder sessions by device (docs/coder-identity.md §4): a browser keeps one
-- random device id (httpOnly cookie, never stored here); its key for a
-- session in a job is a hash of the device id, the deployment and the
-- participant id. A session can have several devices (a transfer link, or
-- logging in on another device). Coarse device details, for the export.
CREATE TABLE coder_devices (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  coder_id INTEGER NOT NULL REFERENCES coders (id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  device_type TEXT, -- phone, tablet, desktop
  browser TEXT,
  os TEXT,
  created TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX coder_devices_coder ON coder_devices (coder_id);

ALTER TABLE coders DROP COLUMN coder_key;
CREATE INDEX coders_email ON coders (job_id, lower(email));

-- The device an answer was given on.
ALTER TABLE annotation_values ADD COLUMN device_id INTEGER REFERENCES coder_devices (id) ON DELETE SET NULL;
