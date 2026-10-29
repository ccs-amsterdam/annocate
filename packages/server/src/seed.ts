import type { Sql } from "./db.js";
import { createJobFromExample } from "./examples.js";

/**
 * Development: the demo job in an empty database, made from the tour
 * example (examples/tour.json), with the invite secret the development app
 * opens by default (`demo-secret`).
 */
export async function seed(db: Sql): Promise<void> {
  await createJobFromExample(db, "tour", { name: "Demo job", ownerId: null, ownerEmail: null, secrets: ["demo-secret"] });
}
