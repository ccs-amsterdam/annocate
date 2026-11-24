import type {
  DesignItem,
  EndItem,
  Highlight,
  InLoopQuestionItem,
  LayoutItem,
  LoopUnits,
  SessionItem,
  StudyEnd,
  UnitLoopItem,
  UrlParam,
} from "@annotinder/contracts";

// The editor's forms change an item by handing the draft a new one
// (itemEdit.ts `updateItem` replaces the item with it). A setting that is
// turned off or emptied is left out of the new item, never set to
// undefined: these are the changes that can remove one.

/** A copy of `obj` with `key` set to `value`, or without `key` if the value is undefined. */
export function withOptional<T extends object, K extends keyof T>(obj: T, key: K, value: T[K] | undefined): T {
  const next = { ...obj };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

/** A copy of `obj` with the settings of `patch`; those that are undefined are removed. */
export function withOptionals<T extends object>(obj: T, patch: Partial<T>): T {
  let next = obj;
  for (const key of Object.keys(patch) as (keyof T)[]) next = withOptional<T, keyof T>(next, key, patch[key]);
  return next;
}

/** The title coders see as the study's name; empty: the study has no public info. */
export function withSessionTitle(session: SessionItem, title: string): SessionItem {
  return withOptional(session, "public", title ? { ...session.public, title } : undefined);
}

/** The session's URL parameters; none: no `urlParams`. */
export function withUrlParams(session: SessionItem, params: UrlParam[]): SessionItem {
  return withOptional(session, "urlParams", params.length > 0 ? params : undefined);
}

/** A part of the session set from its JSON, where null is "not set". */
export function withSessionPart(session: SessionItem, part: "invite" | "urlParams" | "display", value: unknown) {
  return withOptional(session, part, (value ?? undefined) as SessionItem[typeof part]);
}

/** Whether coders can add a comment to a question. */
export function withComments<T extends DesignItem & { type: "question" }>(question: T, comments: boolean): T {
  return withOptional(question, "comments", (comments || undefined) as T["comments"]);
}

/** A loop only some coders get (a condition, to edit from "always") or every coder (none). */
export function withLoopCondition(loop: UnitLoopItem, conditional: boolean): UnitLoopItem {
  return withOptional(loop, "condition", conditional ? { script: "true" } : undefined);
}

/** A loop's units settings; nothing set: all the session's units, once (the default). */
export function withLoopUnits(loop: UnitLoopItem, units: LoopUnits): UnitLoopItem {
  return withOptional(loop, "units", Object.keys(units).length > 0 ? units : undefined);
}

/** Where an end sends coders: nowhere, a URL, or the URL in a deployment setting. */
export type RedirectKind = "" | "url" | "setting";

export function redirectKind(end: Pick<EndItem, "redirectUrl" | "redirectSetting">): RedirectKind {
  if (end.redirectSetting !== undefined) return "setting";
  return end.redirectUrl !== undefined ? "url" : "";
}

/** An end item sending coders somewhere else: the other kind's setting is removed. */
export function withRedirect(end: EndItem, kind: RedirectKind): EndItem {
  // Separate settings by default: panels give a return link per outcome
  const setting = end.outcome === "screenout" ? "panel_screenout" : "panel_return";
  return withOptionals(end, {
    redirectUrl: kind === "url" ? "" : undefined,
    redirectSetting: kind === "setting" ? setting : undefined,
  });
}

/** The study's normal end as an end item's fields give it; nothing set: none. */
export function studyEndOf(end: EndItem): StudyEnd | undefined {
  const studyEnd = withOptionals<StudyEnd>(
    {},
    { message: end.message || undefined, redirectUrl: end.redirectUrl, redirectSetting: end.redirectSetting },
  );
  return Object.keys(studyEnd).length > 0 ? studyEnd : undefined;
}

/** A loop question's instruction and when it opens by itself; without an instruction neither is kept. */
export function withInstruction(
  question: InLoopQuestionItem,
  patch: Partial<Pick<InLoopQuestionItem, "instruction" | "instructionOpen">>,
): InLoopQuestionItem {
  const { instruction, instructionOpen } = { ...question, ...patch };
  return withOptionals(question, {
    instruction: instruction || undefined,
    instructionOpen: instruction ? instructionOpen || undefined : undefined,
  });
}

/** A layout's snippets, by name; none: no `snippets`. */
export function withSnippets(layout: LayoutItem, snippets: [string, string][]): LayoutItem {
  return withOptional(layout, "snippets", snippets.length > 0 ? Object.fromEntries(snippets) : undefined);
}

/** A layout's highlights; none: no `highlight`. */
export function withHighlights(layout: LayoutItem, highlights: Highlight[]): LayoutItem {
  return withOptional(layout, "highlight", highlights.length > 0 ? highlights : undefined);
}
