import { and, eq, sql } from "drizzle-orm";
import {
  coderAgreement,
  krippendorffAlpha,
  pairAgreement,
  percentAgreement,
  type AlphaMetric,
  type AnyVariableType,
  type Coding,
  type QuestionAgreement,
  type SpanAnswer,
  type ValueAnswer,
} from "@annotinder/contracts";
import { rows, type Db } from "../../db/index.js";
import { coderSessions } from "../../db/schema/index.js";
import { unitVersionData } from "../../db/sql.js";
import { deployedQuestions, loopAnswers, type Value } from "./liveAnswers.js";

// Agreement between coders per unit-loop question (Krippendorff's alpha,
// percent agreement, per coder and per pair).

/**
 * The agreement rows of one question: what each coding's value is, per
 * answer type. Several answers: a row per option (given or not). Types
 * without a value to compare (confirm, relations) have none.
 */
function valueRows(
  type: AnyVariableType,
  answers: { unit: number; session: number; values: unknown }[],
): { item: string | null; option: Value | null; metric: AlphaMetric; codings: Coding[] }[] {
  const values = (a: { values: unknown }) => (a.values ?? []) as ValueAnswer[];
  const single = (metric: AlphaMetric, item: string | null = null) => ({
    item,
    option: null,
    metric,
    codings: answers.flatMap((a) => {
      const answer = values(a).find((v) => (v.item ?? null) === item);
      // A special answer ("don't know") is a category of its own; on an ordered scale it is missing
      if (!answer || (metric !== "nominal" && answer.special)) return [];
      const value = answer.value ?? answer.special;
      return value === undefined ? [] : [{ unit: a.unit, coder: a.session, value }];
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
    case "swipe":
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

/** The agreement on every unit-loop question of the deployed design that has values to compare. */
export async function agreement(db: Db, studyId: number): Promise<QuestionAgreement[]> {
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
        pairs: pairAgreement(codings),
      });
    }
  }
  return result;
}
