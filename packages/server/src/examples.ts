import { readdirSync, readFileSync } from "node:fs";
import { z } from "zod";
import {
  DesignItemsSchema,
  RecipeSchema,
  designItems,
  inviteKind,
  inviteOf,
  sessionItem,
  VariableValueSchema,
  validateAnswer,
  validateDesignItems,
  type AnyVariableType,
  type ExampleSummary,
  type TopLevelItem,
  type VariableValue,
} from "@annotinder/contracts";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db } from "./db/index.js";
import {
  annotationValues,
  coderSessions,
  coders,
  links as linksTable,
  units,
  unitVersions,
} from "./db/schema/index.js";
import { collectCoderVariables, collectLoops } from "./runtime/designItems.js";
import { putCoderValues } from "./shared/coders.js";
import { HttpError } from "./shared/http.js";
import type { StudyRow } from "./shared/studies.js";
import { createStudyFromRecipe } from "./shared/recipes.js";

// Example studies (docs/examples.md): recipes (shared/recipes.ts) that
// ship with AnnoTinder, as files in `examples/<id>.json`, with a deployed
// design and sometimes example answers. Making a study from one gives an
// ordinary study, to try and adapt.

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
  /** Example answers: coders (named "Example coder n" in the study) and what they answered, outside loops and per unit. */
  answers: z
    .array(
      z.object({
        variables: z.record(z.string(), ShortAnswerSchema).default({}),
        units: z.record(z.string(), z.record(z.string(), ShortAnswerSchema)).default({}),
        /** The coder's `$session` values, e.g. `{ coder: "anna" }`: they start from the link that carries them. */
        session: z.record(z.string(), z.string()).default({}),
      }),
    )
    .default([]),
}).refine((e) => e.deploy, "An example deploys its design");
type ExampleFile = z.infer<typeof ExampleFileSchema>;

let catalogue: Map<string, ExampleFile> | null = null;

/** The examples, by id (read once). */
function examples(): Map<string, ExampleFile> {
  if (!catalogue) {
    catalogue = new Map();
    for (const file of readdirSync(EXAMPLES_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort()) {
      const parsed = ExampleFileSchema.safeParse(JSON.parse(readFileSync(new URL(file, EXAMPLES_DIR), "utf8")));
      if (!parsed.success) throw new Error(`examples/${file}: ${parsed.error.message}`);
      catalogue.set(file.replace(/\.json$/, ""), parsed.data);
    }
  }
  return catalogue;
}

/** The catalogue (`GET /examples`). */
export function listExamples(): ExampleSummary[] {
  return [...examples()].map(([id, e]) => ({
    id,
    category: e.category,
    title: e.title,
    description: e.description,
    tryThis: e.tryThis,
  }));
}

/** An answer as stored, from its short form in an example file. */
function answerValue(short: ShortAnswer): VariableValue {
  if (Array.isArray(short)) return { done: true, skip: false, values: short.map((value) => ({ value })) };
  if (typeof short !== "object") return { done: true, skip: false, values: [{ value: short }] };
  if ("done" in short) return VariableValueSchema.parse(short);
  if ("spans" in short) return VariableValueSchema.parse({ done: true, skip: false, ...short });
  // item -> value: a scale
  return {
    done: true,
    skip: false,
    values: Object.entries(short).map(([item, value]) => ({ item, value: value as string | number })),
  };
}

export interface FromExampleOptions {
  name?: string;
  /** The researcher who owns the study (null: none, e.g. the development demo). */
  ownerId: number | null;
  /** The owner becomes the study's ADMIN (false: no user roles, development headers). */
  ownerIsAdmin: boolean;
  /** Fixed link secrets, in order (the development demo's `demo-secret`); random otherwise. */
  secrets?: string[];
  /** A fixed public id (the development demo's); random otherwise. */
  publicId?: string;
}

/**
 * Makes a study from an example (its recipe), with its example answers, in
 * one transaction: within the owner's limits on units (the caller checks
 * the number of studies).
 */
export async function createStudyFromExample(db: Db, id: string, options: FromExampleOptions): Promise<StudyRow> {
  const example = examples().get(id);
  if (!example) throw new HttpError(404, `No example '${id}'`);
  // Checked with its Study entry: what depends on the invite (dividing units among a crowd) is checked as deployed
  const withSession = DesignItemsSchema.parse(designItems(example.design)) as TopLevelItem[];
  const items = withSession.filter((item) => item.type !== "session");
  const issues = validateDesignItems(withSession);
  if (issues.length > 0) throw new Error(`examples/${id}.json: ${issues.map((i) => i.message).join("; ")}`);

  return db.transaction(async (tx) => {
    const { study, designVersionId, unitIds, firstLink } = await createStudyFromRecipe(
      tx,
      { ...example, name: options.name ?? example.name },
      {
        ownerId: options.ownerId,
        ownerIsAdmin: options.ownerIsAdmin,
        origin: id,
        secrets: options.secrets,
        publicId: options.publicId,
      },
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
    const check = (name: string, type: AnyVariableType | undefined, value: VariableValue) => {
      if (!type) throw new Error(`examples/${id}.json: no question '${name}'`);
      const errors = validateAnswer(name, type, value);
      if (errors.length > 0) throw new Error(`examples/${id}.json: ${errors.join("; ")}`);
    };
    const links = await tx
      .select({ id: linksTable.id, params: linksTable.params })
      .from(linksTable)
      .where(and(eq(linksTable.studyId, study.id), isNull(linksTable.retiredAt)))
      .orderBy(asc(linksTable.id));
    // The example coders worked over the past days, as real ones would: each starts on another day
    // and codes a few units a day (`exampleTime`), so the overview's activity looks like a study's
    const started = Date.now();
    for (const [i, coder] of example.answers.entries()) {
      const at = (unit: number) => exampleTime(started, i, example.answers.length, unit);
      const unitCount = Object.keys(coder.units).length;
      // The link whose values the coder's session has (a link per coder: their coder id)
      const link = links.find((l) => Object.entries(l.params).every(([name, value]) => coder.session[name] === value));
      if (Object.keys(coder.session).length > 0 && !link)
        throw new Error(`examples/${id}.json: no link for example coder ${i + 1}'s session`);
      const linkId = link?.id ?? firstLink;
      if (linkId === null) throw new Error(`examples/${id}.json: example coders need a deployed study (deploy)`);
      // A coder of the study's kind (not one of its expert coders with units: those are for real coders)
      const exampleCoder = `Example coder ${i + 1}`;
      const kind = inviteKind(inviteOf(sessionItem(withSession)));
      await tx.insert(coders).values({ studyId: study.id, coder: exampleCoder, kind });
      const [made] = await tx
        .insert(coderSessions)
        .values({
          studyId: study.id,
          coder: exampleCoder,
          linkId,
          session: coder.session,
          created: at(0),
          ended: { outcome: "complete", at: at(unitCount) },
        })
        .returning({ id: coderSessions.id });
      const sessionId = made!.id;
      const values = Object.fromEntries(
        Object.entries(coder.variables).map(([name, short]) => [name, answerValue(short)]),
      );
      for (const [name, value] of Object.entries(values))
        check(name, coderTypes.get(name) as AnyVariableType | undefined, value);
      // Random conditions are drawn by the server: stored as assigned values
      const isRandom = (name: string) => coderTypes.get(name)?.type === "experiment";
      const assigned = Object.fromEntries(Object.entries(values).filter(([name]) => isRandom(name)));
      const answered = Object.fromEntries(Object.entries(values).filter(([name]) => !isRandom(name)));
      await putCoderValues(tx, study.id, { sessionId, values: assigned, assigned: true, designVersionId });
      await putCoderValues(tx, study.id, { sessionId, values: answered, designVersionId });
      await tx
        .update(annotationValues)
        .set({ created: at(0), updated: at(0) })
        .where(and(eq(annotationValues.sessionId, sessionId), isNull(annotationValues.unitId)));

      for (const [n, [externalId, answers]] of Object.entries(coder.units).entries()) {
        // A finished unit: every question of a loop answered (`skip` for hidden ones)
        if (!loops.some((loop) => [...loop.variables.keys()].every((name) => name in answers))) {
          throw new Error(`examples/${id}.json: example coder ${i + 1}'s answers to ${externalId} don't finish a loop`);
        }
        const uid = unitId(externalId);
        // The deployed version of the unit, as coders' answers point to theirs
        const [version] = await tx
          .select({ id: unitVersions.id })
          .from(unitVersions)
          .where(and(eq(unitVersions.unitId, uid), isNull(unitVersions.toDeploy)));
        const now = at(n + 1);
        for (const [name, short] of Object.entries(answers)) {
          const value = answerValue(short);
          check(name, unitTypes.get(name), value);
          await tx.insert(annotationValues).values({
            studyId: study.id,
            unitId: uid,
            sessionId,
            variable: name,
            value,
            designVersionId,
            unitVersionId: version!.id,
            created: now,
            updated: now,
          });
        }
        await tx.update(units).set({ coded: true }).where(eq(units.id, uid));
      }
    }
    return study;
  });
}

/**
 * When example coder `coder` (of `coders`) gave their `unit`th answer (0:
 * the questions before the units): coders start on different days over the
 * past two weeks, the last a few days ago, and code three units a day, a
 * few minutes apart. Never in the future.
 */
function exampleTime(now: number, coder: number, coders: number, unit: number): Date {
  const day = 24 * 60 * 60 * 1000;
  const startDay = 13 - Math.round((coder * 10) / Math.max(1, coders - 1));
  const start = now - startDay * day + ((coder * 3) % 8) * 60 * 60 * 1000;
  const at = start + Math.floor(unit / 3) * day + (unit % 3) * 7 * 60 * 1000;
  return new Date(Math.min(at, now - 60 * 1000));
}
