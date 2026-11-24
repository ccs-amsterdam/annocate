import { Hono, type Context } from "hono";
import { StudyFromExampleSchema, RecipeSchema } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { requireResearcher } from "./auth.js";
import { checkStudyLimit } from "./study.js";
import { createStudyFromExample, listExamples } from "../examples.js";
import { toStudyResponse } from "../shared/studies.js";
import { createStudyFromRecipe } from "../shared/recipes.js";
import { parseJson } from "../shared/request.js";

// New studies made for the researcher, owned by them like any study they
// create: from an example, and from a recipe, as importing a design file writes one
// (docs/examples.md).
export function examples(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/examples", requireResearcher(server), (c) => c.json(listExamples()));

  /** The new study's owner, within their limit on studies; development headers keep the bootstrap rule (a study without study users is open). */
  async function owner(c: Context<Env>) {
    const researcher = c.get("researcher");
    const ownerId = researcher.userId;
    await checkStudyLimit(db, ownerId);
    return { ownerId, ownerIsAdmin: !researcher.devRole };
  }

  app.post("/study/from-example", requireResearcher(server, { role: "researcher" }), async (c) => {
    const body = await parseJson(c, StudyFromExampleSchema);
    const study = await createStudyFromExample(db, body.example, {
      name: body.name,
      ...(await owner(c)),
    });
    return c.json(toStudyResponse(study), 201);
  });

  app.post("/study/from-recipe", requireResearcher(server, { role: "researcher" }), async (c) => {
    const body = await parseJson(c, RecipeSchema);
    const options = await owner(c);
    const { study } = await db.transaction((tx) => createStudyFromRecipe(tx, body, options));
    return c.json(toStudyResponse(study), 201);
  });

  return app;
}
