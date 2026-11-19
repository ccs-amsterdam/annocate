import { customType, timestamp } from "drizzle-orm/pg-core";

/** A point in time (TIMESTAMPTZ), as a Date. */
export const timestamptz = () => timestamp({ withTimezone: true });

/** Raw bytes (BYTEA), e.g. a sha256 hash. */
export const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
});
