import { Hono, type Context } from "hono";
import { StudyFromExampleSchema, RecipeSchema } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { requireResearcher } from "./auth.js";
import { checkStudyLimit } from "./study.js";
import { createStudyFromExample, listExamples } from "../examples.js";
import { ensureUser } from "../shared/accounts.js";
import { toStudyResponse } from "../shared/studies.js";
import { createStudyFromRecipe } from "../shared/recipes.js";

// New studies made for the researcher, owned by them like any study they create:
// from an example (docs/plans/examples.md), and from a recipe, as the setup
// wizard writes one (docs/plans/setup-wizard.md).
export function examples(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/examples", requireResearcher(server), (c) => c.json(listExamples()));

  /** The new study's owner, within their limit on studies; development headers keep the bootstrap rule (a study without study users is open). */
  async function owner(c: Context<Env>) {
    const researcher = c.get("researcher");
    const ownerId = researcher.userId ?? (await ensureUser(db, researcher.email)).id;
    await checkStudyLimit(db, ownerId);
    return { ownerId, ownerEmail: researcher.devRole ? null : researcher.email };
  }

  app.post("/study/from-example", requireResearcher(server, { role: "researcher" }), async (c) => {
    const parsed = StudyFromExampleSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const study = await createStudyFromExample(db, parsed.data.example, { name: parsed.data.name, ...(await owner(c)) });
    return c.json(toStudyResponse(study), 201);
  });

  app.post("/study/from-recipe", requireResearcher(server, { role: "researcher" }), async (c) => {
    const parsed = RecipeSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const options = await owner(c);
    const { study } = await db.transaction((tx) => createStudyFromRecipe(tx, parsed.data, options));
    return c.json(toStudyResponse(study), 201);
  });

  return app;
}
