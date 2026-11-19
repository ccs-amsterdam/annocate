-- A loop's units are one set of settings, no longer branches
-- (docs/plans/unit-assignment.md): a coder's units follow from their session
-- values, and coders.assignments only marks the loops a coder reached (by
-- loop key: { "<loop>": { "at": <ms> } }). The stored routings were keyed by
-- branch fingerprint: dropped.
UPDATE coders SET assignments = '{}';
