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

/**
 * Holds a relation question's relations while it is on screen
 * (`RelationAnnotationState`): the spans its rules name come from this
 * unit's answers so far; it starts from its earlier answer, as far as its
 * spans still exist.
 */
export function RelationAnnotationProvider({
  variable,
  loopVariables,
  unitVariables,
  initialRelations,
  children,
}: {
  variable: RelationType;
  /** The loop's questions: the span questions give their spans' labels and colours. */
  loopVariables: ReadonlyMap<string, AnyVariableType> | null;
  unitVariables: Record<string, VariableValue> | undefined;
  initialRelations: RelationAnswer[] | undefined;
  children: ReactNode;
}) {
  const spans = useMemo<RelationSpan[]>(
    () =>
      ruleVariables(variable.rules).flatMap((name) => {
        const question = loopVariables?.get(name);
        const options = question?.type === "span" ? question.options : [];
        return (unitVariables?.[name]?.spans ?? []).map((s) => ({
          ...s,
          variable: name,
          label: optionLabelOf(options, s.value),
          color: optionColor(options, s.value),
        }));
      }),
    [variable.rules, unitVariables, loopVariables],
  );
  const [relations, setRelations] = useState<RelationAnswer[]>(() =>
    (initialRelations ?? []).filter((r) => spans.some((s) => s.id === r.fromId) && spans.some((s) => s.id === r.toId)),
  );
  const [start, setStart] = useState<string | null>(null);
  const [pending, setPending] = useState<{ fromId: string; toId: string } | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const value = useMemo<RelationAnnotationState>(() => {
    const byId = new Map(spans.map((s) => [s.id, s]));
    const typesFor = (fromId: string, toId: string) => {
      const from = byId.get(fromId);
      const to = byId.get(toId);
      return from && to ? relationTypesFor(variable.rules, variable.options, from, to) : [];
    };
    const toggle = (fromId: string, toId: string, type: string) =>
      setRelations((list) => {
        const existing = list.find((r) => r.fromId === fromId && r.toId === toId && r.value === type);
        return existing ? list.filter((r) => r !== existing) : [...list, { id: newId(), fromId, toId, value: type }];
      });
    const canStart = (id: string) => {
      const span = byId.get(id);
      return !!span && canStartRelation(variable.rules, span);
    };
    return {
      options: variable.options,
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
  }, [spans, relations, start, pending, highlighted, variable.rules, variable.options]);

  return <RelationAnnotationContext.Provider value={value}>{children}</RelationAnnotationContext.Provider>;
}
