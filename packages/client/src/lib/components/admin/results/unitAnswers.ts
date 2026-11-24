import type { RelationAnswer, ResultsUnit, SpanAnswer, VariableValue } from "@annotinder/contracts";
import { answerText, type Write } from "../../../admin/exportAnswers";

/** One coder's answer to a question about a unit: its text, per scale item (one text without items). */
interface AnswerRow {
  sessionId: number;
  coder: string | null;
  texts: string[];
}

/**
 * Each coder's answer to a question about a unit, as text, and whether they
 * differ. Spans and relations are written by their text, in text order: two
 * coders who marked the same words gave the same answer, whatever ids their
 * spans have.
 */
export function questionAnswerRows(
  detail: ResultsUnit,
  question: string,
  items: (string | undefined)[],
  write: Write,
): { rows: AnswerRow[]; differ: boolean } {
  const rows = detail.answers
    .filter((a) => a.variable === question)
    .map((a) => {
      const spans = sessionSpans(detail, a.sessionId);
      return { sessionId: a.sessionId, coder: a.coder, texts: items.map((item) => text(a.value, item, write, spans)) };
    });
  const differ = items.some((_, i) => new Set(rows.map((r) => r.texts[i])).size > 1);
  return { rows, differ };
}

/** A coder's spans in this unit, by id: what their relations point to. */
function sessionSpans(detail: ResultsUnit, sessionId: number): Map<string, SpanAnswer> {
  const spans = detail.answers.filter((a) => a.sessionId === sessionId).flatMap((a) => a.value.spans ?? []);
  return new Map(spans.map((s) => [s.id, s]));
}

function text(
  value: VariableValue,
  item: string | undefined,
  write: Write,
  spans: ReadonlyMap<string, SpanAnswer>,
): string {
  if (value.spans) return spanList(value.spans, write);
  if (value.relations) return relationList(value.relations, write, spans);
  return answerText(value, item, write) || (value.skip ? "(skipped)" : "");
}

const spanText = (span: SpanAnswer) => span.slices.map((x) => x.text).join(" … ");
const byPlace = (a: SpanAnswer, b: SpanAnswer) =>
  a.field.localeCompare(b.field) || a.slices[0].offset - b.slices[0].offset;

/** Spans as "label: text", in text order. */
function spanList(spans: SpanAnswer[], write: Write): string {
  if (spans.length === 0) return "(none)";
  return [...spans]
    .sort(byPlace)
    .map((s) => `${write(s.value)}: ${spanText(s)}`)
    .join("; ");
}

/** Relations as "label: from → to" (the spans' texts), in the order of their first span. */
function relationList(relations: RelationAnswer[], write: Write, spans: ReadonlyMap<string, SpanAnswer>): string {
  if (relations.length === 0) return "(none)";
  const end = (id: string) => {
    const span = spans.get(id);
    return span ? spanText(span) : "(a span that is gone)";
  };
  const place = (r: RelationAnswer) => spans.get(r.fromId);
  return [...relations]
    .sort((a, b) => {
      const [from, other] = [place(a), place(b)];
      return from && other ? byPlace(from, other) : 0;
    })
    .map((r) => `${write(r.value)}: ${end(r.fromId)} → ${end(r.toId)}`)
    .join("; ");
}
