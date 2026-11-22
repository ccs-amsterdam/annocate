import { useEffect, useState } from "react";
import {
  buildScope,
  type AnyVariableType,
  type UnitData,
  type UnitLayout,
  type VariableValue,
} from "@annotinder/contracts";
import { renderTemplate, type RenderedTemplate, type TemplateProgress } from "../../codebook/renderTemplate";

/**
 * The layout with its values evaluated against the unit (and the preview
 * answers), like StudyManager does while coding. Values using answers that
 * aren't set render as empty.
 */
export function useRenderedLayout(
  layout: UnitLayout,
  unit: UnitData,
  questions: ReadonlyMap<string, AnyVariableType> | undefined,
  answers: Record<string, VariableValue> | undefined,
  progress: TemplateProgress | undefined,
  selectable: string[],
): RenderedTemplate {
  const [rendered, setRendered] = useState<RenderedTemplate>({ markdown: "", values: [] });
  const key = JSON.stringify([layout, unit, answers, progress, selectable]);
  useEffect(() => {
    let cancelled = false;
    const scope = buildScope(questions ?? new Map(), answers ?? {}, unit);
    renderTemplate(layout.template, scope, undefined, "preview", {
      progress,
      snippets: layout.snippets,
      selectable,
    }).then(
      (result) => !cancelled && setRendered(result),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content: the default layout is a new object each render
  }, [key]);
  return rendered;
}
