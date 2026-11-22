import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import {
  coderAgreement,
  collectQuestions,
  krippendorffAlpha,
  percentAgreement,
  specialOptions,
  type AlphaMetric,
  type AnyVariableType,
  type Coding,
  type QuestionAgreement,
  type QuestionAnswers,
  type SpanAnswer,
} from "@annotinder/contracts";
import type { Server, Env } from "../context.js";
import { rows, type Db } from "../db/index.js";
import { coderSessions, deployments, designVersions } from "../db/schema/index.js";
import { unitVersionData } from "../db/sql.js";
import { designVersionItems } from "../shared/designVersions.js";
import { requireStudyUser } from "./auth.js";

// The researcher's look at the answers so far (contracts results.ts): counts
// per question, and agreement per unit-loop question. Live answers only,
// under the deployed design's questions. Counting happens in the database;
// agreement reads one question's values at a time, so memory stays small.

type Value = string | number;

/** The deployed design's questions, with their loop (null outside loops). */
async function deployedQuestions(db: Db, studyId: number) {
  const [row] = await db
    .select({ items: designVersions.items, session: designVersions.session })
    .from(deployments)
    .innerJoin(designVersions, eq(designVersions.id, deployments.designVersionId))
    .where(eq(deployments.studyId, studyId));
  if (!row) return [];
  const { questions, loopOf } = collectQuestions(designVersionItems(row));
  return [...questions].map(([name, type]) => ({ name, type, loop: loopOf.get(name) ?? null }));
}

// Queries name the answers table `a`: `value` alone would also be jsonb_array_elements' column
const live = (studyId: number) => sql`a.study_id = ${studyId} AND a.retired_at IS NULL`;
const notSkipped = sql`NOT COALESCE((a.value->>'skip')::boolean, false)`;

async function answerCounts(db: Db, studyId: number): Promise<QuestionAnswers[]> {
  const questions = await deployedQuestions(db, studyId);
  const totals = await rows<{ variable: string; answered: number; skipped: number }>(
    db,
    sql`SELECT variable, count(*) FILTER (WHERE ${notSkipped})::int AS answered,
          count(*) FILTER (WHERE NOT (${notSkipped}))::int AS skipped
        FROM annotation_values a WHERE ${live(studyId)} GROUP BY variable`,
  );
  // Values (with a scale's item), span labels and relation labels, counted
  const counted = await rows<{ variable: string; item: string | null; value: Value; count: number }>(
    db,
    sql`SELECT variable, item, value, count(*)::int AS count FROM (
          SELECT a.variable, v->>'item' AS item, v->'value' AS value
            FROM annotation_values a, jsonb_array_elements(COALESCE(a.value->'values', '[]')) v
            WHERE ${live(studyId)} AND ${notSkipped}
          UNION ALL
          SELECT a.variable, NULL, s->'value'
            FROM annotation_values a,
              jsonb_array_elements(COALESCE(a.value->'spans', '[]') || COALESCE(a.value->'relations', '[]')) s
            WHERE ${live(studyId)} AND ${notSkipped}
        ) answers GROUP BY variable, item, value ORDER BY count DESC`,
  );
  const total = new Map(totals.map((t) => [t.variable, t]));
  return questions.flatMap(({ name, type, loop }) => {
    const items = type.type === "scale" ? type.items.map((i) => i.name) : [null];
    return items.map((item) => {
      const counts = counted
        .filter((c) => c.variable === name && c.item === item)
        .map(({ value, count }) => ({ value, count }));
      const row = total.get(name);
      // A scale's item: the answers that rate it
      const answered = item === null ? (row?.answered ?? 0) : counts.reduce((sum, c) => sum + c.count, 0);
      return { question: name, item, loop, type: type.type, answered, skipped: row?.skipped ?? 0, counts };
    });
  });
}

/** One question's live answers in units: per unit and session, the answer's values (or spans, with the unit version). */
async function loopAnswers(db: Db, studyId: number, variable: string, spans: boolean) {
  return rows<{ unit: number; version: number | null; session: number; values: unknown; spans: unknown }>(
    db,
    sql`SELECT unit_id AS unit, unit_version_id AS version, session_id AS session,
          a.value->'values' AS values, ${spans ? sql`a.value->'spans'` : sql`NULL`} AS spans
        FROM annotation_values a
        WHERE ${live(studyId)} AND variable = ${variable} AND unit_id IS NOT NULL AND ${notSkipped}`,
  );
}

/**
 * The agreement rows of one question: what each coding's value is, per
 * answer type. Several answers: a row per option (given or not). Types
 * without a value to compare (confirm, relations) have none.
 */
function valueRows(
  type: AnyVariableType,
  answers: { unit: number; session: number; values: unknown }[],
): { item: string | null; option: Value | null; metric: AlphaMetric; codings: Coding[] }[] {
  const values = (a: { values: unknown }) => (a.values ?? []) as { value: Value; item?: string }[];
  const special = new Set<Value>(
    "options" in type && Array.isArray(type.options) ? specialOptions(type.options).map((o) => o.value) : [],
  );
  const single = (metric: AlphaMetric, item: string | null = null) => ({
    item,
    option: null,
    metric,
    codings: answers.flatMap((a) => {
      const value = values(a).find((v) => (v.item ?? null) === item)?.value;
      // Special options ("don't know") aren't on an ordered scale: missing there
      if (value === undefined || (metric !== "nominal" && special.has(value))) return [];
      return [{ unit: a.unit, coder: a.session, value }];
    }),
  });
  switch (type.type) {
    case "nominal":
      if (!type.multiple) return [single("nominal")];
      return type.options.map((o) => ({
        item: null,
        option: o.value,
        metric: "nominal" as const,
        codings: answers.map((a) => ({
          unit: a.unit,
          coder: a.session,
          value: values(a).some((v) => v.value === o.value) ? 1 : 0,
        })),
      }));
    case "annotinder":
      return [single("nominal")];
    case "ordinal":
      return [single("ordinal")];
    case "scale":
      return type.items.map((i) => single("ordinal", i.name));
    case "numeric":
      return [single("interval")];
    default:
      return [];
  }
}

/**
 * A span question's agreement rows: per label, each word of a unit's text
 * (runs of non-space, as the coding screen selects) labelled or not by each
 * coder of that unit version. Units are compared per version: coders of
 * another version saw other text.
 */
async function spanRows(
  db: Db,
  answers: { version: number | null; session: number; spans: unknown }[],
  labels: Value[],
): Promise<{ item: null; option: Value; metric: AlphaMetric; codings: Coding[] }[]> {
  const byVersion = new Map<number, { session: number; spans: SpanAnswer[] }[]>();
  for (const a of answers) {
    if (a.version === null) continue;
    const list = byVersion.get(a.version) ?? [];
    list.push({ session: a.session, spans: (a.spans ?? []) as SpanAnswer[] });
    byVersion.set(a.version, list);
  }
  const shared = [...byVersion].filter(([, coders]) => coders.length >= 2);
  const texts = new Map<number, Record<string, unknown>>();
  for (let i = 0; i < shared.length; i += 500) {
    const ids = shared.slice(i, i + 500).map(([id]) => id);
    const found = await rows<{ id: number; data: Record<string, unknown> }>(
      db,
      sql`SELECT id, ${unitVersionData(sql`unit_versions.id`)} AS data FROM unit_versions
          WHERE id IN (${sql.join(
            ids.map((id) => sql`${id}`),
            sql`, `,
          )})`,
    );
    for (const { id, data } of found) texts.set(id, data);
  }
  const codings = new Map<Value, Coding[]>(labels.map((l) => [l, []]));
  for (const [version, coders] of shared) {
    const data = texts.get(version) ?? {};
    const fields = new Set(coders.flatMap((c) => c.spans.map((s) => s.field)));
    for (const field of fields) {
      const text = data[field];
      if (typeof text !== "string") continue;
      const words = [...text.matchAll(/\S+/g)].map((m) => [m.index, m.index + m[0].length] as const);
      for (const { session, spans } of coders)
        for (const label of labels) {
          const mine = spans.filter((s) => s.field === field && s.value === label).flatMap((s) => s.slices);
          words.forEach(([start, end], w) =>
            codings.get(label)!.push({
              unit: `${version}/${field}/${w}`,
              coder: session,
              value: mine.some((s) => s.offset < end && s.offset + s.length > start) ? 1 : 0,
            }),
          );
        }
    }
  }
  return labels.map((option) => ({ item: null, option, metric: "nominal", codings: codings.get(option)! }));
}

async function agreement(db: Db, studyId: number): Promise<QuestionAgreement[]> {
  const questions = (await deployedQuestions(db, studyId)).filter((q) => q.loop !== null);
  const names = new Map(
    (
      await db
        .select({ id: coderSessions.id, coder: coderSessions.coder })
        .from(coderSessions)
        .where(and(eq(coderSessions.studyId, studyId)))
    ).map((s) => [s.id, s.coder]),
  );
  const result: QuestionAgreement[] = [];
  for (const { name, type, loop } of questions) {
    const isSpan = type.type === "span";
    if (!isSpan && valueRows(type, []).length === 0) continue;
    const answers = await loopAnswers(db, studyId, name, isSpan);
    const found = isSpan
      ? await spanRows(
          db,
          answers,
          type.options.map((o) => o.value),
        )
      : valueRows(type, answers);
    for (const { item, option, metric, codings } of found) {
      const units = new Map<Value, number>();
      for (const c of codings) units.set(c.unit, (units.get(c.unit) ?? 0) + 1);
      result.push({
        question: name,
        item,
        option,
        loop: loop!,
        type: type.type,
        metric,
        alpha: krippendorffAlpha(codings, metric),
        percent: percentAgreement(codings),
        units: [...units.values()].filter((n) => n >= 2).length,
        coders: coderAgreement(codings).map(({ coder, ...rest }) => ({
          sessionId: coder,
          coder: names.get(coder) ?? null,
          ...rest,
        })),
      });
    }
  }
  return result;
}

export function results(server: Server): Hono<Env> {
  const app = new Hono<Env>();
  app.get("/study/:studyId/results/answers", requireStudyUser(server, "READ"), async (c) =>
    c.json({ questions: await answerCounts(server.db, c.get("studyId")) }),
  );
  app.get("/study/:studyId/results/agreement", requireStudyUser(server, "READ"), async (c) =>
    c.json({ questions: await agreement(server.db, c.get("studyId")) }),
  );
  return app;
}
