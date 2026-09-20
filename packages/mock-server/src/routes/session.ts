import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import {
  PostUnitVariablesSchema,
  PostCoderVariablesSchema,
  type SessionResponse,
  type CoderUnitResponse,
  type CodebookResponse,
  type CodebookItem,
  type UnitLoopItem,
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

/** Finds the unit_loop matching a unitset name, or matching all units if no unitset is specified */
function findLoopForUnitset(items: CodebookItem[], setname: string, isAllUnits: boolean): UnitLoopItem | undefined {
  for (const item of items) {
    if (item.type === "unit_loop") {
      if (isAllUnits && (!item.unitset || item.unitset === "" || item.unitset === "__all__")) {
        return item as UnitLoopItem;
      }
      if (!isAllUnits && item.unitset === setname) {
        return item as UnitLoopItem;
      }
    }
    if ("children" in item && Array.isArray(item.children)) {
      const found = findLoopForUnitset(item.children as CodebookItem[], setname, isAllUnits);
      if (found) return found;
    }
  }
  return undefined;
}

/** Deterministically shuffles an array with a numeric seed using Mulberry32 PRNG */
function shuffleWithSeed<T>(array: T[], seed: number): T[] {
  const result = [...array];
  let s = seed;
  const random = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function sessionRoutes(db: DatabaseSync) {
  const app = new Hono<HonoEnv>();

  app.get("/session", requireCoder(db), (c) => {
    const jobId = c.get("jobId");
    const coder = c.get("coder")!;
    const codebookRow = getActiveCodebook(db, jobId);
    if (!codebookRow) return c.json({ error: "No codebook has been created for this job yet" }, 404);

    const doneUnitIds = JSON.parse(coder.doneUnitIds) as Record<string, number[]>;
    const hasNamedUnitsets = Object.keys(doneUnitIds).some((k) => k !== "__all__" && k !== "");

    const response: SessionResponse = {
      coderId: coder.id,
      jobId,
      codebook: toCodebookResponse(codebookRow),
      progress: Object.entries(doneUnitIds)
        .filter(([unitset]) => {
          if (unitset === "") return false;
          if (unitset === "__all__" && hasNamedUnitsets) return false;
          return true;
        })
        .map(([unitset, ids]) => ({ unitset, doneUnitIds: ids })),
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

    let unitIds: number[];
    const isAllUnits = !setname || setname === "__all__" || setname === "default";

    if (isAllUnits) {
      const rows = db.prepare("SELECT id FROM units WHERE jobId = ? ORDER BY id").all(jobId) as unknown as { id: number }[];
      unitIds = rows.map((r) => r.id);
    } else {
      const unitset = db.prepare("SELECT * FROM unitsets WHERE jobId = ? AND name = ?").get(jobId, setname) as
        | UnitsetRow
        | undefined;
      if (!unitset) return c.json({ error: `Unitset '${setname}' not found` }, 404);
      unitIds = JSON.parse(unitset.unitIds);
    }

    // Check codebook to see if unit_loop has randomizeUnits enabled for this loop
    const codebookRow = getActiveCodebook(db, jobId);
    if (codebookRow) {
      try {
        const items = JSON.parse(codebookRow.items) as CodebookItem[];
        const loop = findLoopForUnitset(items, setname, isAllUnits);
        if (loop?.randomizeUnits) {
          unitIds = shuffleWithSeed(unitIds, coder.id + jobId * 1000);
        }
      } catch {
        // Fallback to unrandomized order
      }
    }

    const doneUnitIds = JSON.parse(coder.doneUnitIds) as Record<string, number[]>;
    const doneKey = isAllUnits ? "__all__" : setname;
    const done = new Set([...(doneUnitIds[doneKey] ?? []), ...(doneUnitIds[""] ?? [])]);
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
    // and in the global all-units progress list.
    const allDone = Object.values(variables).every((v) => v.done);
    if (allDone) {
      const doneUnitIds = JSON.parse(coder.doneUnitIds) as Record<string, number[]>;
      const doneAll = doneUnitIds["__all__"] ?? [];
      if (!doneAll.includes(unitId)) {
        doneUnitIds["__all__"] = [...doneAll, unitId];
      }

      const unitsets = db.prepare("SELECT * FROM unitsets WHERE jobId = ?").all(jobId) as unknown as UnitsetRow[];
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
