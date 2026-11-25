import type { EndItem, EndValues, ReferenceScope, UnitData, VariableValue } from "@annotinder/contracts";
import { fillRedirectUrl } from "@annotinder/contracts";
import type { ExpressionCache } from "../codebook/expressionCache";
import { renderTemplate } from "../codebook/renderTemplate";
import type { SessionDesign } from "./sessionDesign";
import type { SessionEnding } from "./types";

/** How the session ends at an `end` item: its message and redirect, with their values filled in; null without an item. */
export async function renderEnding(
  item: EndItem | null,
  scope: ReferenceScope,
  cache: ExpressionCache,
): Promise<SessionEnding | null> {
  if (!item) return null;
  return {
    item,
    message: item.message ? await renderTemplate(item.message, scope, cache, `end:${item.name}`) : null,
    redirectUrl: item.redirectUrl ? fillRedirectUrl(item.redirectUrl, scope) : null,
  };
}

/**
 * The values an ending is shown with again, after a reload: the coder's,
 * and for an end inside a unit loop also the unit's data and answers (as
 * when it was reached). Without the unit (e.g. no longer in the study), the
 * coder's only.
 */
export function endScope(
  design: SessionDesign,
  coderVisible: Record<string, VariableValue>,
  values: EndValues | null,
): ReferenceScope {
  if (!values) return design.scope(coderVisible);
  return design.scope(
    { ...coderVisible, ...values.variables, ...values.unit?.variables },
    values.unit?.data as UnitData | undefined,
  );
}
