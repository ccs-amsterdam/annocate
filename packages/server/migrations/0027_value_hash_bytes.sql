-- Value hashes as raw bytes: sha256 in 32 bytes instead of 64 hex characters.
-- sha256 rather than md5: a pair of different values with the same md5 can
-- be made on purpose, and would be stored as one value.
DROP FUNCTION unit_value_hash(JSONB);
ALTER TABLE unit_values ALTER COLUMN hash TYPE BYTEA USING sha256(convert_to(value::text, 'UTF8'));
CREATE FUNCTION unit_value_hash(value JSONB) RETURNS BYTEA LANGUAGE sql IMMUTABLE AS $$
  SELECT sha256(convert_to(value::text, 'UTF8'))
$$;
