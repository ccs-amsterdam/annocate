import { parseArgs } from "node:util";
import { describeDatabase, openDatabase } from "./database.js";
import { resetIdentities } from "./shared/accounts.js";

// After moving to another login provider without account linking (or after
// its transition period), from the server's machine:
//
//   pnpm --filter @annotinder/server identities reset --yes
//
// Forgets all login identities: users re-claim their account with their
// verified email address at their next login (docs/accounts.md "Changing
// providers"). Uses the same database settings as the server; stop the
// server first with a PGlite database.

const { positionals, values } = parseArgs({ allowPositionals: true, options: { yes: { type: "boolean" } } });
if (positionals[0] !== "reset") {
  console.error("Usage: identities reset --yes");
  process.exit(1);
}
if (!values.yes) {
  console.error(
    "This forgets every login identity and ends all sessions: users re-claim their account by email at their next login. Add --yes to do it.",
  );
  process.exit(1);
}

const db = await openDatabase();
try {
  const { users, unclaimable } = await resetIdentities(db);
  console.error(describeDatabase());
  console.log(`${users} users can re-claim their account by logging in with their email address.`);
  if (unclaimable > 0)
    console.log(`${unclaimable} users share an email address with a more recent user, and can't be claimed.`);
} finally {
  await db.close();
}
