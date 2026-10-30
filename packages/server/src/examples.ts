import { readdirSync, readFileSync } from "node:fs";
import { z } from "zod";
import {
  CodebookItemsSchema,
  RecipeSchema,
  VariableValueSchema,
  shownUnitFields,
  validateAnswer,
  validateCodebookItems,
  type AnyVariableType,
  type ExampleSummary,
  type TopLevelItem,
  type UnitData,
  type VariableValue,
} from "@annotinder/contracts";
import { one, type Sql } from "./db.js";
import { collectCoderVariables, collectLoops } from "./runtime/codebook.js";
import { putCoderValues } from "./shared/coders.js";
import { HttpError } from "./shared/http.js";
import type { JobRow } from "./shared/jobs.js";
import { createJobFromRecipe } from "./shared/recipes.js";
import { unitHash } from "./shared/units.js";

// Example jobs (docs/plans/examples.md): recipes (shared/recipes.ts) that
// ship with AnnoTinder, as files in `examples/<id>.json`, with a published
// codebook and sometimes example answers. Making a job from one gives an
// ordinary job, to try and adapt.

const EXAMPLES_DIR = new URL("../examples/", import.meta.url);

/**
 * An answer in an example file, short: a value (`"positive"`, `3`), a list
 * of values (several answers), item -> value (a scale), `{ spans }`, or a
 * full `VariableValue` (with `done`).
 */
const ShortAnswerSchema = z.union([
  z.string(),
  z.number(),
  z.array(z.union([z.string(), z.number()])),
  z.record(z.string(), z.unknown()),
]);
type ShortAnswer = z.infer<typeof ShortAnswerSchema>;

const ExampleFileSchema = RecipeSchema.extend({
  category: z.string(),
  title: z.string(),
  description: z.string(),
  tryThis: z.array(z.string()),
  /** Example answers: coders (named "Example coder n" in the job) and what they answered, outside loops and per unit. */
  answers: z
    .array(
      z.object({
        variables: z.record(z.string(), ShortAnswerSchema).default({}),
        units: z.record(z.string(), z.record(z.string(), ShortAnswerSchema)).default({}),
      }),
    )
    .default([]),
}).refine((e) => e.publish && e.invites.length > 0, "An example publishes its codebook and has an invitation");
type ExampleFile = z.infer<typeof ExampleFileSchema>;

let catalogue: Map<string, ExampleFile> | null = null;

/** The examples, by id (read once). */
function examples(): Map<string, ExampleFile> {
  if (!catalogue) {
    catalogue = new Map();
    for (const file of readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith(".json")).sort()) {
      const parsed = ExampleFileSchema.safeParse(JSON.parse(readFileSync(new URL(file, EXAMPLES_DIR), "utf8")));
      if (!parsed.success) throw new Error(`examples/${file}: ${parsed.error.message}`);
      catalogue.set(file.replace(/\.json$/, ""), parsed.data);
    }
  }
  return catalogue;
}

/** The catalogue (`GET /examples`). */
export function listExamples(): ExampleSummary[] {
  return [...examples()].map(([id, e]) => ({ id, category: e.category, title: e.title, description: e.description, tryThis: e.tryThis }));
}

/** An answer as stored, from its short form in an example file. */
export function answerValue(short: ShortAnswer): VariableValue {
  if (Array.isArray(short)) return { done: true, skip: false, values: short.map((value) => ({ value })) };
  if (typeof short !== "object") return { done: true, skip: false, values: [{ value: short }] };
  if ("done" in short) return VariableValueSchema.parse(short);
  if ("spans" in short) return VariableValueSchema.parse({ done: true, skip: false, ...short });
  // item -> value: a scale
  return { done: true, skip: false, values: Object.entries(short).map(([item, value]) => ({ item, value: value as string | number })) };
}

export interface FromExampleOptions {
  name?: string;
  /** The researcher who owns the job (null: none, e.g. the development demo). */
  ownerId: number | null;
  /** They become the job's ADMIN; null: no job users (development headers). */
  ownerEmail: string | null;
  /** Fixed invite secrets, in order (the development demo's `demo-secret`); random otherwise. */
  secrets?: string[];
}

/**
 * Makes a job from an example (its recipe), with its example answers, in
 * one transaction: within the owner's limits on units (the caller checks
 * the number of jobs).
 */
export async function createJobFromExample(db: Sql, id: string, options: FromExampleOptions): Promise<JobRow> {
  const example = examples().get(id);
  if (!example) throw new HttpError(404, `No example '${id}'`);
  const items = CodebookItemsSchema.parse(example.codebook.items) as TopLevelItem[];
  const issues = validateCodebookItems(items);
  if (issues.length > 0) throw new Error(`examples/${id}.json: ${issues.map((i) => i.message).join("; ")}`);

  return db.transaction(async (tx) => {
    const { job, codebookId, unitIds, firstInvite } = await createJobFromRecipe(
      tx,
      { ...example, name: options.name ?? example.name },
      { ownerId: options.ownerId, ownerEmail: options.ownerEmail, origin: id, secrets: options.secrets },
    );
    const unitId = (externalId: string) => {
      const found = unitIds.get(externalId);
      if (found === undefined) throw new Error(`examples/${id}.json: no unit '${externalId}'`);
      return found;
    };

    // Example answers
    const coderTypes = collectCoderVariables(items);
    const loops = collectLoops(items);
    const unitTypes = new Map<string, AnyVariableType>(loops.flatMap((loop) => [...loop.variables]));
    const shown = shownUnitFields(items);
    const check = (name: string, type: AnyVariableType | undefined, value: VariableValue) => {
      if (!type) throw new Error(`examples/${id}.json: no question '${name}'`);
      const errors = validateAnswer(name, type, value);
      if (errors.length > 0) throw new Error(`examples/${id}.json: ${errors.join("; ")}`);
    };
    for (const [i, coder] of example.answers.entries()) {
      const coderId = (await one<{ id: number }>(
        tx,
        "INSERT INTO coders (job_id, participant_id, invite_id, ended) VALUES ($1, $2, $3, $4) RETURNING id",
        [job.id, `Example coder ${i + 1}`, firstInvite, JSON.stringify({ outcome: "complete", at: new Date() })],
      ))!.id;
      const values = Object.fromEntries(Object.entries(coder.variables).map(([name, short]) => [name, answerValue(short)]));
      for (const [name, value] of Object.entries(values)) check(name, coderTypes.get(name) as AnyVariableType | undefined, value);
      const isAuto = (name: string) => coderTypes.get(name)?.type === "auto";
      const assigned = Object.fromEntries(Object.entries(values).filter(([name]) => isAuto(name)));
      const answered = Object.fromEntries(Object.entries(values).filter(([name]) => !isAuto(name)));
      await putCoderValues(tx, job.id, { coderId, values: assigned, assigned: true, codebookId });
      await putCoderValues(tx, job.id, { coderId, values: answered, codebookId });

      for (const [externalId, answers] of Object.entries(coder.units)) {
        // A finished unit: every question of a loop answered (`skip` for hidden ones)
        if (!loops.some((loop) => [...loop.variables.keys()].every((name) => name in answers))) {
          throw new Error(`examples/${id}.json: example coder ${i + 1}'s answers to ${externalId} don't finish a loop`);
        }
        const uid = unitId(externalId);
        const unit = example.units.find((u) => u.id === externalId)!;
        const data: UnitData = Object.fromEntries(shown.filter((f) => f in unit.data).map((f) => [f, unit.data[f]])) as UnitData;
        const version = (await one<{ id: number }>(
          tx,
          `INSERT INTO unit_versions (job_id, unit_id, hash, data) VALUES ($1, $2, $3, $4)
           ON CONFLICT (unit_id, hash) DO UPDATE SET hash = excluded.hash RETURNING id`,
          [job.id, uid, unitHash(externalId, data), JSON.stringify(data)],
        ))!.id;
        for (const [name, short] of Object.entries(answers)) {
          const value = answerValue(short);
          check(name, unitTypes.get(name), value);
          await tx.query(
            `INSERT INTO annotation_values (job_id, unit_id, coder_id, variable, value, codebook_id, unit_version_id, created, updated)
             VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
            [job.id, uid, coderId, name, JSON.stringify(value), codebookId, version],
          );
        }
        await tx.query("UPDATE units SET coded = true WHERE id = $1", [uid]);
      }
    }
    return job;
  });
}
