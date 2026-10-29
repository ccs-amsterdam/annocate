-- A coder holds leases on a batch of a shared queue's units
-- (docs/architecture.md §3), not one.
ALTER TABLE unit_leases DROP CONSTRAINT unit_leases_pkey;
ALTER TABLE unit_leases ADD PRIMARY KEY (job_id, loop_key, unitset, coder_id, unit_id);
