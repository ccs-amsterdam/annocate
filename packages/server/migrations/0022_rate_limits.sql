-- Rate limits (docs/security.md "Rate limits"): a counter per key and
-- minute. UNLOGGED: no write-ahead log, so cheap to write; the counts are
-- lost on a crash, which is fine for limits. Old minutes are deleted by
-- the server (shared/rateLimit.ts); vacuumed eagerly, as it churns.
CREATE UNLOGGED TABLE rate_limits (
  key TEXT NOT NULL,
  minute TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (key, minute)
) WITH (fillfactor = 70, autovacuum_vacuum_scale_factor = 0, autovacuum_vacuum_threshold = 1000);
