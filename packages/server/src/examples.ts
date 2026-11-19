import { readdirSync, readFileSync } from "node:fs";
import { z } from "zod";
import {
  DesignItemsSchema,
  RecipeSchema,
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
import { annotationValues, coders, links as linksTable, units, unitVersions } from "./db/schema/index.js";
import { collectCoderVariables, collectLoops } from "./runtime/designItems.js";
import { putCoderValues } from "./shared/coders.js";
import { HttpError } from "./shared/http.js";
import type { StudyRow } from "./shared/studies.js";
import { createStudyFromRecipe } from "./shared/recipes.js";

// Example studies (docs/plans/examples.md): recipes (shared/recipes.ts) that
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
}).refine((e) => e.publish, "An example publishes its design");
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
}

/**
 * Makes a study from an example (its recipe), with its example answers, in
 * one transaction: within the owner's limits on units (the caller checks
 * the number of studies).
 */
export async function createStudyFromExample(db: Db, id: string, options: FromExampleOptions): Promise<StudyRow> {
  const example = examples().get(id);
  if (!example) throw new HttpError(404, `No example '${id}'`);
  const items = DesignItemsSchema.parse(example.design.items) as TopLevelItem[];
  const issues = validateDesignItems(items);
  if (issues.length > 0) throw new Error(`examples/${id}.json: ${issues.map((i) => i.message).join("; ")}`);

  return db.transaction(async (tx) => {
    const { study, designVersionId, unitIds, firstLink } = await createStudyFromRecipe(
      tx,
      { ...example, name: options.name ?? example.name },
      { ownerId: options.ownerId, ownerIsAdmin: options.ownerIsAdmin, origin: id, secrets: options.secrets },
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
    for (const [i, coder] of example.answers.entries()) {
      // The link whose values the coder's session has (their coder, a condition by link)
      const link = links.find((l) => Object.entries(l.params).every(([name, value]) => coder.session[name] === value));
      if (Object.keys(coder.session).length > 0 && !link) throw new Error(`examples/${id}.json: no link for example coder ${i + 1}'s session`);
      const [made] = await tx
        .insert(coders)
        .values({
          studyId: study.id,
          participantId: `Example coder ${i + 1}`,
          linkId: link?.id ?? firstLink,
          session: coder.session,
          ended: { outcome: "complete", at: new Date() },
        })
        .returning({ id: coders.id });
      const coderId = made!.id;
      const values = Object.fromEntries(
        Object.entries(coder.variables).map(([name, short]) => [name, answerValue(short)]),
      );
      for (const [name, value] of Object.entries(values))
        check(name, coderTypes.get(name) as AnyVariableType | undefined, value);
      const isAuto = (name: string) => coderTypes.get(name)?.type === "random";
      const assigned = Object.fromEntries(Object.entries(values).filter(([name]) => isAuto(name)));
      const answered = Object.fromEntries(Object.entries(values).filter(([name]) => !isAuto(name)));
      await putCoderValues(tx, study.id, { coderId, values: assigned, assigned: true, designVersionId });
      await putCoderValues(tx, study.id, { coderId, values: answered, designVersionId });

      for (const [externalId, answers] of Object.entries(coder.units)) {
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
        const now = new Date();
        for (const [name, short] of Object.entries(answers)) {
          const value = answerValue(short);
          check(name, unitTypes.get(name), value);
          await tx.insert(annotationValues).values({
            studyId: study.id,
            unitId: uid,
            coderId,
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
