import { Hono } from "hono";
import { JobFromExampleSchema } from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { requireResearcher } from "./auth.js";
import { checkJobLimit } from "./job.js";
import { createJobFromExample, listExamples } from "../examples.js";
import { ensureUser } from "../shared/accounts.js";
import { toJobResponse } from "../shared/jobs.js";

// Example jobs (docs/plans/examples.md): the catalogue, and a new job from
// one, owned by the researcher like any job they create.
export function examples(server: Server): Hono<Env> {
  const { db } = server;
  const app = new Hono<Env>();

  app.get("/examples", requireResearcher(server), (c) => c.json(listExamples()));

  app.post("/job/from-example", requireResearcher(server, { role: "researcher" }), async (c) => {
    const parsed = JobFromExampleSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const researcher = c.get("researcher");
    const ownerId = researcher.userId ?? (await ensureUser(db, researcher.email)).id;
    await checkJobLimit(db, ownerId);
    const job = await createJobFromExample(db, parsed.data.example, {
      name: parsed.data.name,
      ownerId,
      // Development headers keep the bootstrap rule instead (a job without job users is open).
      ownerEmail: researcher.devRole ? null : researcher.email,
    });
    return c.json(toJobResponse(job), 201);
  });

  return app;
}
