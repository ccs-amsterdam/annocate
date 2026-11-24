import { useMemo, useState, type ReactNode } from "react";
import {
  canStartRelation,
  relationTypesFor,
  ruleVariables,
  type RelationAnswer,
  type AnyVariableType,
  type RelationType,
  type VariableValue,
} from "@annotinder/contracts";
import { optionColor, optionLabelOf } from "../components/spanText";
import { RelationAnnotationContext, type RelationAnnotationState, type RelationSpan } from "./relationAnnotation";

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

interface RelationAnnotationProps {
  /** The relation question on screen; null: another kind of question (no state, the unit stays as it is). */
  variable: RelationType | null;
  /** The question's name: another question of the unit starts over. */
  question?: string;
  /** The loop's questions: the span questions give their spans' labels and colours. */
  loopVariables: ReadonlyMap<string, AnyVariableType> | null;
  unitVariables: Record<string, VariableValue> | undefined;
  initialRelations: RelationAnswer[] | undefined;
  children: ReactNode;
}

type Sources = Pick<RelationAnnotationProps, "loopVariables" | "unitVariables">;

/** The spans a relation question's rules name, from this unit's answers so far. */
function relationSpans(rules: RelationType["rules"] | undefined, sources: Sources): RelationSpan[] {
  if (!rules) return [];
  const { loopVariables, unitVariables } = sources;
  return ruleVariables(rules).flatMap((name) => {
    const question = loopVariables?.get(name);
    const options = question?.type === "span" ? question.options : [];
    return (unitVariables?.[name]?.spans ?? []).map((s) => ({
      ...s,
      variable: name,
      label: optionLabelOf(options, s.value),
      color: optionColor(options, s.value),
    }));
  });
}

/** An earlier answer's relations, as far as their spans still exist. */
function existingRelations(relations: RelationAnswer[] | undefined, spans: RelationSpan[]): RelationAnswer[] {
  const ids = new Set(spans.map((s) => s.id));
  return (relations ?? []).filter((r) => ids.has(r.fromId) && ids.has(r.toId));
}

/**
 * Holds a relation question's relations while it is on screen
 * (`RelationAnnotationState`): the spans its rules name come from this
 * unit's answers so far; it starts from its earlier answer, as far as its
 * spans still exist. It stays around the unit for all of the unit's
 * questions (so the unit isn't mounted again per question), without state
 * for the other ones, and starts over at each question.
 */
export function RelationAnnotationProvider({
  variable,
  question,
  loopVariables,
  unitVariables,
  initialRelations,
  children,
}: RelationAnnotationProps) {
  const rules = variable?.rules;
  const options = variable?.options;
  const spans = useMemo(
    () => relationSpans(rules, { loopVariables, unitVariables }),
    [rules, loopVariables, unitVariables],
  );
  const [relations, setRelations] = useState(() => existingRelations(initialRelations, spans));
  const [start, setStart] = useState<string | null>(null);
  const [pending, setPending] = useState<{ fromId: string; toId: string } | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  // Another question: start over. Adjusted while rendering rather than in an
  // effect, so there is no render with the previous question's relations.
  const [shownQuestion, setShownQuestion] = useState(question);
  if (question !== shownQuestion) {
    setShownQuestion(question);
    setRelations(existingRelations(initialRelations, spans));
    setStart(null);
    setPending(null);
    setHighlighted(null);
  }

  const value = useMemo<RelationAnnotationState | null>(() => {
    if (!rules || !options) return null;
    const byId = new Map(spans.map((s) => [s.id, s]));
    const typesFor = (fromId: string, toId: string) => {
      const from = byId.get(fromId);
      const to = byId.get(toId);
      return from && to ? relationTypesFor(rules, options, from, to) : [];
    };
    const toggle = (fromId: string, toId: string, type: string) =>
      setRelations((list) => {
        const existing = list.find((r) => r.fromId === fromId && r.toId === toId && r.value === type);
        return existing ? list.filter((r) => r !== existing) : [...list, { id: newId(), fromId, toId, value: type }];
      });
    const canStart = (id: string) => {
      const span = byId.get(id);
      return !!span && canStartRelation(rules, span);
    };
    return {
      options,
      spans,
      relations,
      start,
      pending,
      highlighted,
      setHighlighted,
      canStart,
      canEnd: (id) => start !== null && typesFor(start, id).length > 0,
      typesFor,
      clickSpan: (id) => {
        if (start === null || id === start) {
          // Start here (or stop starting here)
          setPending(null);
          setStart(id === start || !canStart(id) ? null : id);
          return;
        }
        const types = typesFor(start, id);
        if (types.length === 0) {
          // Not a destination: start again from here, if a relation can
          setStart(canStart(id) ? id : null);
          return;
        }
        const exists = relations.some((r) => r.fromId === start && r.toId === id);
        if (types.length === 1 && !exists) {
          toggle(start, id, types[0]);
          setStart(null);
        } else {
          setPending({ fromId: start, toId: id });
          setStart(null);
        }
      },
      choose: (type) => {
        if (!pending) return;
        toggle(pending.fromId, pending.toId, type);
        setPending(null);
      },
      openRelation: (relationId) => {
        const relation = relations.find((r) => r.id === relationId);
        if (!relation) return;
        setStart(null);
        setPending({ fromId: relation.fromId, toId: relation.toId });
      },
      remove: (relationId) => setRelations((list) => list.filter((r) => r.id !== relationId)),
      cancel: () => {
        setStart(null);
        setPending(null);
      },
    };
  }, [spans, relations, start, pending, highlighted, rules, options]);

  return <RelationAnnotationContext.Provider value={value}>{children}</RelationAnnotationContext.Provider>;
}
