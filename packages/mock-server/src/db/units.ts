import { createHash } from "node:crypto";

/**
 * A unit's content hash (`BackendUnit.hash`, `UnitMeta.hash`): changes when
 * its content does.
 */
export function unitHash(externalId: string, data: string): string {
  return createHash("sha256").update(externalId).update(data).digest("hex").slice(0, 16);
}
