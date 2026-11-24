import type { Db } from "./db/index.js";
import { createStudyFromExample } from "./examples.js";
import { DEMO_PUBLIC_ID } from "./db/publicId.js";

/**
 * Development: the demo study in an empty database, made from the tour
 * example (examples/tour.json), with the link secret `demo-secret` (a
 * development server's coder home links to it:
 * /code/demostudy001?link=demo-secret).
 */
export async function seed(db: Db): Promise<void> {
  await createStudyFromExample(db, "tour", {
    name: "Demo study",
    ownerId: null,
    ownerIsAdmin: false,
    secrets: ["demo-secret"],
    publicId: DEMO_PUBLIC_ID,
  });
}
