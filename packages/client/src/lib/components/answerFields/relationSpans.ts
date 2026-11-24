import type { RelationSpan } from "../../context/relationAnnotation";
import { spanSummary } from "../spanText";

/** A span as a relation's end is named: its text, quoted. */
export const spanName = (span: RelationSpan | undefined) => (span ? `"${spanSummary(span.slices)}"` : "(a span)");
