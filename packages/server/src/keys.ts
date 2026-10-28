import { parseArgs } from "node:util";
import { describeDatabase, openDatabase } from "./database.js";
import { createApiKey, ensureUser, listApiKeys, revokeApiKey } from "./shared/accounts.js";

// Managing researchers' API keys from the server's machine, e.g. to give
// the first researcher a key (there is no researcher login yet):
//
//   pnpm --filter @annotinder/server keys create --email a@uni.nl --label "R scripts" --role researcher
//   pnpm --filter @annotinder/server keys list --email a@uni.nl
//   pnpm --filter @annotinder/server keys revoke --email a@uni.nl --id 3
//
// Uses the same database settings as the server (DATABASE_URL, PGLITE_DIR).
// A PGlite database can't be opened by two processes: stop the server first.

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { email: { type: "string" }, label: { type: "string" }, id: { type: "string" }, role: { type: "string" } },
});
const command = positionals[0];
if (!["create", "list", "revoke"].includes(command ?? "") || !values.email) {
  console.error("Usage: keys create|list|revoke --email <email> [--label <label>] [--id <key id>] [--role user|researcher|admin]");
  process.exit(1);
}

const db = await openDatabase();
try {
  const user = await ensureUser(db, values.email);
  // The account role (docs/accounts.md): a researcher creates jobs, an admin manages the server.
  if (values.role) {
    if (!["user", "researcher", "admin"].includes(values.role)) throw new Error("--role is user, researcher or admin");
    await db.query("UPDATE users SET role = $1 WHERE id = $2", [values.role, user.id]);
  }
  console.error(`${describeDatabase()}, user ${user.email}`);
  if (command === "create") {
    const key = await createApiKey(db, user.id, values.label ?? "API key");
    console.error(`Created key ${key.id} (${key.label}). It is shown only now:`);
    console.log(key.key);
  } else if (command === "list") {
    for (const key of await listApiKeys(db, user.id)) {
      const state = key.revokedAt ? `revoked ${key.revokedAt.toISOString()}` : `last used ${key.lastUsed?.toISOString() ?? "never"}`;
      console.log(`${key.id}\t${key.prefix}…\t${key.label}\t${state}`);
    }
  } else {
    const key = values.id ? await revokeApiKey(db, user.id, Number(values.id)) : null;
    if (!key) throw new Error("No such key for this user (--id)");
    console.log(`Revoked key ${key.id} (${key.label})`);
  }
} finally {
  await db.close();
}
