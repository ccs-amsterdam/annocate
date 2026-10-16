import { SigningKeys } from "./keys.js";

// Prints a new signing key for ANNOTINDER_SIGNING_KEYS (keys.ts). Keep it
// secret: whoever has it can request job tokens as this job server.
//   pnpm --filter @annotinder/job-server keygen
console.log(JSON.stringify([await SigningKeys.generate()]));
