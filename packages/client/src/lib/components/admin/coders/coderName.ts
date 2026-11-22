import type { CoderProgress } from "@annotinder/contracts";

/** How a coder is named in the UI: coder id, email or number. */
export const coderName = (c: CoderProgress) => c.coder ?? c.email ?? `#${c.id}`;
