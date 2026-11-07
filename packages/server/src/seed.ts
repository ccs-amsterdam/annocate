import type { Sql } from "./db.js";
import { createStudyFromExample } from "./examples.js";

/**
 * Development: the demo study in an empty database, made from the tour
 * example (examples/tour.json), with the link secret `demo-secret` (a
 * development server's coder home links to it: /code/1?link=demo-secret).
 */
export async function seed(db: Sql): Promise<void> {
  await createStudyFromExample(db, "tour", { name: "Demo study", ownerId: null, ownerEmail: null, secrets: ["demo-secret"] });
}
