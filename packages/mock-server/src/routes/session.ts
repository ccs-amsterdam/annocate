import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import {
  ALL_UNITS_UNITSET,
  CodebookItemsSchema,
  PostUnitVariablesSchema,
  PostCoderVariablesSchema,
  branchMatches,
  resolveUnitsetName,
  seededShuffle,
  type SessionResponse,
  type CoderUnitResponse,
  type CodebookResponse,
  type TopLevelItem,
  type UnitLoopItem,
  type VariableValue,
} from "@annotinder/contracts";
import type { HonoEnv } from "../honoEnv.js";
import { requireCoder, type CoderRow } from "../auth.js";
import { getAnnotation, putAnnotation } from "../db/annotations.js";

// LEGACY: coders talking to the db server directly. Superseded by the job
// server (docs/architecture.md); kept only because the admin Preview still
// uses it. It approximates unit_loop distribution for previewing: the first
// matching branch, with every source treated as fixed (no shared queue) and
// no server-assigned auto variables.

interface CodebookRow {
  id: number;
  jobId: number;
  name: string;
  items: string;
  created: string;
  immutable: number;
}

function toCodebookResponse(row: CodebookRow): CodebookResponse {
  const raw = JSON.parse(row.items);
  const parsed = CodebookItemsSchema.safeParse(raw); // migrates legacy loop shapes
  return {
    id: row.id,
    jobId: row.jobId,
    name: row.name,
    items: parsed.success ? parsed.data : raw,
    created: new Date(row.created),
    immutable: !!row.immutable,
  };
}

/** For previews, "the current session's codebook" is simply the most recently created one for the job. */
function getActiveCodebook(db: DatabaseSync, jobId: number): CodebookRow | undefined {
  return db.prepare("SELECT * FROM codebooks WHERE jobId = ? ORDER BY id DESC LIMIT 1").get(jobId) as
    | CodebookRow
    | undefined;
}

function findLoop(items: TopLevelItem[], name: string): UnitLoopItem | undefined {
  for (const item of items) {
    if (item.type === "unit_loop" && item.name === name) return item;
    if (item.type === "condition") {
      const found = findLoop(item.children, name);
      if (found) return found;
    }
  }
  return undefined;
}

function variableCodes(coder: CoderRow): Record<string, string | undefined> {
  const variables = JSON.parse(coder.variables) as Record<string, VariableValue>;
  return Object.fromEntries(Object.entries(variables).map(([k, v]) => [k, v.codes?.[0]?.code]));
}

/** The units of a loop for this coder: first matching branch, sources concatenated. */
function loopUnitIds(db: DatabaseSync, jobId: number, loop: UnitLoopItem, coder: CoderRow): number[] {
  const values = variableCodes(coder);
  const branch = loop.units.find((b) => branchMatches(b.when, values));
  if (!branch) return [];
  const ids: number[] = [];
  for (const source of branch.sources) {
    const name = resolveUnitsetName(source.unitset, values);
    if (name === null) continue;
    if (name === ALL_UNITS_UNITSET) {
      const rows = db.prepare("SELECT id FROM units WHERE jobId = ? ORDER BY id").all(jobId) as unknown as { id: number }[];
      ids.push(...rows.map((r) => r.id));
    } else {
      const row = db.prepare("SELECT unitIds FROM unitsets WHERE jobId = ? AND name = ?").get(jobId, name) as
        | { unitIds: string }
        | undefined;
      if (row) ids.push(...(JSON.parse(row.unitIds) as number[]));
    }
  }
  const unique = [...new Set(ids)];
  return loop.order === "random" ? seededShuffle(unique, coder.id + jobId * 1000) : unique;
}

/** Unit ids this coder finished (every live value done), in order of first answer. */
function doneUnitIds(db: DatabaseSync, coderId: number): number[] {
  const rows = db
    .prepare(
      `SELECT unitId FROM annotation_values WHERE coderId = ? AND retiredAt IS NULL
       GROUP BY unitId HAVING MIN(json_extract(value, '$.done')) = 1 ORDER BY MIN(created), unitId`,
    )
    .all(coderId) as unknown as { unitId: number }[];
  return rows.map((r) => r.unitId);
}

export function sessionRoutes(db: DatabaseSync) {
  const app = new Hono<HonoEnv>();

  app.get("/session", requireCoder(db), (c) => {
    const jobId = c.get("jobId");
    const coder = c.get("coder")!;
    const codebookRow = getActiveCodebook(db, jobId);
    if (!codebookRow) return c.json({ error: "No codebook has been created for this job yet" }, 404);

    const codebook = toCodebookResponse(codebookRow);
    const done = doneUnitIds(db, coder.id);
    const loops: UnitLoopItem[] = [];
    const collect = (items: TopLevelItem[]) =>
      items.forEach((i) => (i.type === "unit_loop" ? loops.push(i) : i.type === "condition" && collect(i.children)));
    collect(codebook.items as TopLevelItem[]);

    const response: SessionResponse = {
      coderId: coder.id,
      jobId,
      codebook,
      progress: loops.map((loop) => {
        const ids = new Set(loopUnitIds(db, jobId, loop, coder));
        const totalUnits = Math.min(ids.size, loop.maxUnits ?? Infinity);
        return { unitset: loop.name, doneUnitIds: done.filter((id) => ids.has(id)), totalUnits };
      }),
      variables: JSON.parse(coder.variables),
    };
    return c.json(response);
  });

  app.get("/loop/:loop/next", requireCoder(db), (c) => {
    const jobId = c.get("jobId");
    const coder = c.get("coder")!;
    const codebookRow = getActiveCodebook(db, jobId);
    if (!codebookRow) return c.json({ error: "No codebook has been created for this job yet" }, 404);

    const loopName = c.req.param("loop")!;
    const loop = findLoop(toCodebookResponse(codebookRow).items as TopLevelItem[], loopName);
    if (!loop) return c.json({ error: `No unit loop '${loopName}'` }, 404);

    const done = new Set(doneUnitIds(db, coder.id));
    const unitIds = loopUnitIds(db, jobId, loop, coder);
    if (loop.maxUnits !== undefined && unitIds.filter((id) => done.has(id)).length >= loop.maxUnits) return c.json(null);
    const nextUnitId = unitIds.find((id) => !done.has(id));
    if (nextUnitId === undefined) return c.json(null);

    const unitRow = db.prepare("SELECT * FROM units WHERE jobId = ? AND id = ?").get(jobId, nextUnitId) as
      | { id: number; externalId: string; data: string }
      | undefined;
    if (!unitRow) return c.json({ error: `Unit ${nextUnitId} referenced by unitset not found` }, 500);

    const response: CoderUnitResponse = {
      id: unitRow.id,
      externalId: unitRow.externalId,
      data: JSON.parse(unitRow.data),
      variables: getAnnotation(db, unitRow.id, coder.id) ?? {},
    };
    return c.json(response);
  });

  app.get("/loop/:loop/units/:unitId", requireCoder(db), (c) => {
    const jobId = c.get("jobId");
    const coder = c.get("coder")!;
    const unitId = Number(c.req.param("unitId"));
    const unitRow = db.prepare("SELECT * FROM units WHERE jobId = ? AND id = ?").get(jobId, unitId) as
      | { id: number; externalId: string; data: string }
      | undefined;
    if (!unitRow) return c.json({ error: "Unit not found" }, 404);
    const response: CoderUnitResponse = {
      id: unitRow.id,
      externalId: unitRow.externalId,
      data: JSON.parse(unitRow.data),
      variables: getAnnotation(db, unitRow.id, coder.id) ?? {},
    };
    return c.json(response);
  });

  app.post("/variables/unit", requireCoder(db), async (c) => {
    const parsed = PostUnitVariablesSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const jobId = c.get("jobId");
    const coder = c.get("coder")!;
    const { unitId, variables } = parsed.data;

    if (!db.prepare("SELECT 1 FROM units WHERE jobId = ? AND id = ?").get(jobId, unitId)) {
      return c.json({ error: "Unit not found" }, 404);
    }
    putAnnotation(db, jobId, unitId, coder.id, variables);
    return c.body(null, 204);
  });

  app.post("/variables/coder", requireCoder(db), async (c) => {
    const parsed = PostCoderVariablesSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const coder = c.get("coder")!;
    // Keep preset (invite) variables the client doesn't know about.
    const variables = { ...JSON.parse(coder.variables), ...parsed.data.variables };
    db.prepare("UPDATE coders SET variables = ? WHERE id = ?").run(JSON.stringify(variables), coder.id);
    return c.body(null, 204);
  });

  return app;
}
