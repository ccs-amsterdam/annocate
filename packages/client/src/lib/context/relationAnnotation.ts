import { createContext, useContext } from "react";
import type { NominalOption, RelationAnswer, SpanAnswer } from "@annotinder/contracts";

/** A span a relation can use: a span answer, with the span question it answers. */
export interface RelationSpan extends SpanAnswer {
  variable: string;
  /** Its value's label and colour (from its span question). */
  label: string;
  color: string | undefined;
}

/**
 * The current relation question's state (docs/client.md §4 "Span and
 * relation answers"), shared by the text (spans to click: `RelationText`),
 * the arrows over it (`RelationArrows`) and the answer field
 * (`RelationAnswerField`). `StudyRunner` provides it while a relation
 * question is on screen.
 *
 * Making a relation: click a span where one can start (`start`), then one
 * it can go to; with one possible type it is made at once, else the pair
 * waits for its type (`pending`).
 */
export interface RelationAnnotationState {
  /** The relation types (the question's options). */
  options: NominalOption[];
  /** The spans the question's rules name, in this unit. */
  spans: RelationSpan[];
  relations: RelationAnswer[];
  /** The span a new relation starts at. */
  start: string | null;
  /** A pair of spans waiting for the relation type (also an existing pair, to change it). */
  pending: { fromId: string; toId: string } | null;
  /** The span or relation under the pointer or focus: its arrows drawn fully. */
  highlighted: string | null;
  setHighlighted: (id: string | null) => void;
  canStart: (spanId: string) => boolean;
  /** With a start: whether a relation can go from it to this span. */
  canEnd: (spanId: string) => boolean;
  /** The relation types between two spans, in option order. */
  typesFor: (fromId: string, toId: string) => string[];
  clickSpan: (spanId: string) => void;
  /** For the pending pair: adds the relation of this type, or removes it if there. */
  choose: (type: string) => void;
  /** Opens a relation's pair, to change or remove its type. */
  openRelation: (relationId: string) => void;
  remove: (relationId: string) => void;
  /** Drops the start and the pending pair. */
  cancel: () => void;
}

export const RelationAnnotationContext = createContext<RelationAnnotationState | null>(null);

export function useRelationAnnotation(): RelationAnnotationState | null {
  return useContext(RelationAnnotationContext);
}
