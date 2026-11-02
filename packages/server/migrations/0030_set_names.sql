-- Terminology (docs/glossary.md §3): a lease's set, not "unitset".
ALTER TABLE unit_leases RENAME COLUMN unitset TO set_name;
