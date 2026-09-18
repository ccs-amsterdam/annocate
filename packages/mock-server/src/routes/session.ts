import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import {
  PostUnitVariablesSchema,
  PostCoderVariablesSchema,
  type SessionResponse,
  type CoderUnitResponse,
  type CodebookResponse,
} from "@annotinder/contracts";
import type { HonoEnv } from "../honoEnv.js";
import { requireCoder } from "../auth.js";

interface CodebookRow {
  id: number;
  jobId: number;
  name: string;
  items: string;
  created: string;
  immutable: number;
}
interface UnitsetRow {
  id: number;
  jobId: number;
  name: string;
  unitIds: string;
  order: string;
}
interface UnitRow {
  id: number;
  jobId: number;
  externalId: string;
  data: string;
  immutable: number;
  variables: string;
}

function toCodebookResponse(row: CodebookRow): CodebookResponse {
  return {
    id: row.id,
    jobId: row.jobId,
    name: row.name,
    items: JSON.parse(row.items),
    created: new Date(row.created),
    immutable: !!row.immutable,
  };
}

/** For MVP, "the current session's codebook" is simply the most recently created one for the job. */
function getActiveCodebook(db: DatabaseSync, jobId: number): CodebookRow | undefined {
  return db.prepare("SELECT * FROM codebooks WHERE jobId = ? ORDER BY id DESC LIMIT 1").get(jobId) as
    | CodebookRow
    | undefined;
}

export function sessionRoutes(db: DatabaseSync) {
  const app = new Hono<HonoEnv>();

  app.get("/session", requireCoder(db), (c) => {
    const jobId = c.get("jobId");
    const coder = c.get("coder")!;
    const codebookRow = getActiveCodebook(db, jobId);
    if (!codebookRow) return c.json({ error: "No codebook has been created for this job yet" }, 404);

    const doneUnitIds = JSON.parse(coder.doneUnitIds) as Record<string, number[]>;
    const response: SessionResponse = {
      coderId: coder.id,
      jobId,
      codebook: toCodebookResponse(codebookRow),
      progress: Object.entries(doneUnitIds).map(([unitset, ids]) => ({ unitset, doneUnitIds: ids })),
    };
    return c.json(response);
  });

  // design plan §3a decision (MVP option A): the client derives "next" from
  // the done-unit-id list in `/session`; this endpoint simply returns the
  // first not-yet-done unit in the unitset's stored order. It does not by
  // itself mark anything done -- that happens in POST /variables/unit below.
  app.get("/unitset/:setname/next", requireCoder(db), (c) => {
    const jobId = c.get("jobId");
    const coder = c.get("coder")!;
    const setname = c.req.param("setname")!;

    const unitset = db.prepare("SELECT * FROM unitsets WHERE jobId = ? AND name = ?").get(jobId, setname) as
      | UnitsetRow
      | undefined;
    if (!unitset) return c.json({ error: `Unitset '${setname}' not found` }, 404);

    const unitIds: number[] = JSON.parse(unitset.unitIds);
    const doneUnitIds = JSON.parse(coder.doneUnitIds) as Record<string, number[]>;
    const done = new Set(doneUnitIds[setname] ?? []);
    const nextUnitId = unitIds.find((id) => !done.has(id));
    if (nextUnitId === undefined) return c.json(null);

    const unitRow = db.prepare("SELECT * FROM units WHERE jobId = ? AND id = ?").get(jobId, nextUnitId) as
      | UnitRow
      | undefined;
    if (!unitRow) return c.json({ error: `Unit ${nextUnitId} referenced by unitset not found` }, 500);

    const variablesByCoder = JSON.parse(unitRow.variables) as Record<string, unknown>;
    const response: CoderUnitResponse = {
      id: unitRow.id,
      externalId: unitRow.externalId,
      data: JSON.parse(unitRow.data),
      variables: (variablesByCoder[coder.id] as CoderUnitResponse["variables"]) ?? {},
    };
    return c.json(response);
  });

  app.post("/variables/unit", requireCoder(db), async (c) => {
    const parsed = PostUnitVariablesSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const jobId = c.get("jobId");
    const coder = c.get("coder")!;
    const { unitId, variables } = parsed.data;

    const unitRow = db.prepare("SELECT * FROM units WHERE jobId = ? AND id = ?").get(jobId, unitId) as
      | UnitRow
      | undefined;
    if (!unitRow) return c.json({ error: "Unit not found" }, 404);

    const variablesByCoder = JSON.parse(unitRow.variables) as Record<string, unknown>;
    variablesByCoder[coder.id] = variables;
    db.prepare("UPDATE units SET variables = ?, immutable = 1 WHERE jobId = ? AND id = ?").run(
      JSON.stringify(variablesByCoder),
      jobId,
      unitId,
    );

    // Mark this unit done, for this coder, in every unitset that contains it
    // (simplification: the contract doesn't currently carry which unitset a
    // submission belongs to; see CONTRACTS.md/design plan §3a for the
    // follow-up design work this MVP choice defers).
    const allDone = Object.values(variables).every((v) => v.done);
    if (allDone) {
      const doneUnitIds = JSON.parse(coder.doneUnitIds) as Record<string, number[]>;
      const unitsets = db.prepare("SELECT * FROM unitsets WHERE jobId = ?").all(jobId) as UnitsetRow[];
      for (const unitset of unitsets) {
        const ids: number[] = JSON.parse(unitset.unitIds);
        if (!ids.includes(unitId)) continue;
        const done = doneUnitIds[unitset.name] ?? [];
        if (!done.includes(unitId)) doneUnitIds[unitset.name] = [...done, unitId];
      }
      db.prepare("UPDATE coders SET doneUnitIds = ? WHERE id = ?").run(JSON.stringify(doneUnitIds), coder.id);
    }

    return c.body(null, 204);
  });

  app.post("/variables/coder", requireCoder(db), async (c) => {
    const parsed = PostCoderVariablesSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const coder = c.get("coder")!;
    db.prepare("UPDATE coders SET variables = ? WHERE id = ?").run(JSON.stringify(parsed.data.variables), coder.id);
    return c.body(null, 204);
  });

  return app;
}
