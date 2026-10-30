import { Hono, type Context } from "hono";
import { JobFromExampleSchema, RecipeSchema } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { requireResearcher } from "./auth.js";
import { checkJobLimit } from "./job.js";
import { createJobFromExample, listExamples } from "../examples.js";
import { ensureUser } from "../shared/accounts.js";
import { toJobResponse } from "../shared/jobs.js";
import { createJobFromRecipe } from "../shared/recipes.js";

// New jobs made for the researcher, owned by them like any job they create:
// from an example (docs/plans/examples.md), and from a recipe, as the setup
// wizard writes one (docs/plans/setup-wizard.md).
export function examples(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/examples", requireResearcher(server), (c) => c.json(listExamples()));

  /** The new job's owner, within their limit on jobs; development headers keep the bootstrap rule (a job without job users is open). */
  async function owner(c: Context<Env>) {
    const researcher = c.get("researcher");
    const ownerId = researcher.userId ?? (await ensureUser(db, researcher.email)).id;
    await checkJobLimit(db, ownerId);
    return { ownerId, ownerEmail: researcher.devRole ? null : researcher.email };
  }

  app.post("/job/from-example", requireResearcher(server, { role: "researcher" }), async (c) => {
    const parsed = JobFromExampleSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const job = await createJobFromExample(db, parsed.data.example, { name: parsed.data.name, ...(await owner(c)) });
    return c.json(toJobResponse(job), 201);
  });

  app.post("/job/from-recipe", requireResearcher(server, { role: "researcher" }), async (c) => {
    const parsed = RecipeSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const options = await owner(c);
    const { job } = await db.transaction((tx) => createJobFromRecipe(tx, parsed.data, options));
    return c.json(toJobResponse(job), 201);
  });

  return app;
}
