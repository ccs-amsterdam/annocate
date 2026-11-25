import {
  DesignConflictSchema,
  designItems,
  splitDesignItems,
  type DesignConflict,
  type DesignVersion,
  type DesignVersionMeta,
  type DesignWrite,
  type TopLevelItem,
} from "@annotinder/contracts";
import { ResearcherApiError } from "../api/httpResearcherApi";
import { emptyHistory, recordChange, redo, undo, type EditHistory } from "./editHistory";
import { ensureKeys, stripKeys } from "./itemEdit";
import { carryKeys } from "./itemShape";
import { canonicalJson } from "./jsonFormat";
import type { DesignBackup } from "./localBackup";

// The editor's draft (useDesignDraft holds it): how it starts from a
// version, how edits, undo and saving change it, and what saving asks of
// the server.

export interface DraftStart {
  /** The items to edit, with editor keys. */
  items: TopLevelItem[];
  /** The items as last saved, with the same keys: what changed is told against them. */
  saved: TopLevelItem[];
  /** The saved revision the edits are based on (contracts DesignWriteSchema `revision`). */
  revision: number | undefined;
}

/**
 * The draft of a version (none: a new design). With `restore`, unsaved
 * edits from an earlier session (localBackup.ts) are continued: on the
 * version they were made on as they were left; on another version (a draft
 * was made, or deployed, since) as edits of that one.
 */
export function startDraft(version: DesignVersion | null | undefined, restore?: DesignBackup | null): DraftStart {
  // The Study entry (session and public info) is edited as the first item (contracts designItems), stored next to the items.
  // A new design has only that entry: who codes isn't chosen yet.
  const versionItems = designItems(version ?? { items: [] }) as TopLevelItem[];
  if (!restore) {
    const items = ensureKeys(versionItems);
    return { items, saved: items, revision: version?.revision };
  }
  const items = ensureKeys(restore.items);
  if (restore.designVersionId === (version?.id ?? null))
    return { items, saved: ensureKeys(restore.saved), revision: restore.revision };
  return { items, saved: ensureKeys(carryKeys(versionItems, items)), revision: version?.revision };
}

/** What saving a draft does: a new version, an update of one, or first a question (someone else saved meanwhile). */
export type SaveRequest =
  { create: DesignWrite } | { update: number; body: DesignWrite } | { conflict: DesignConflict };

export function saveRequest({
  items,
  version,
  revision,
  newerDraft,
  overwrite,
}: {
  /** The draft's items (with or without editor keys). */
  items: TopLevelItem[];
  /** The version being edited; null/undefined for a new design. */
  version?: DesignVersion | null;
  revision: number | undefined;
  /** A draft someone else made while this version was edited (versions.ts `draftMadeMeanwhile`). */
  newerDraft?: DesignVersionMeta | null;
  /** Save over what someone else saved meanwhile. */
  overwrite: boolean;
}): SaveRequest {
  const design = splitDesignItems(stripKeys(items));
  if (newerDraft && !overwrite) return { conflict: conflictWith(newerDraft) };
  if (newerDraft) return { update: newerDraft.id, body: { note: newerDraft.note ?? undefined, ...design } };
  // A frozen (live) version is never overwritten: its changes become a new draft
  if (!version || version.immutable) return { create: design };
  const body = { note: version.note ?? undefined, ...design, revision: overwrite ? undefined : revision };
  return { update: version.id, body };
}

/** The conflict of saving past a draft someone else made, as the server's for a draft saved meanwhile. */
function conflictWith(draft: DesignVersionMeta): DesignConflict {
  return {
    error: `${draft.updatedBy ?? "Someone"} saved a draft since you opened this design`,
    code: "design_conflict",
    updated: draft.updated,
    updatedBy: draft.updatedBy,
    revision: draft.revision,
  };
}

/** The draft while it is edited: its items, what is saved, the undo steps, and a save someone else was ahead of. */
export interface DraftState extends DraftStart {
  history: EditHistory<TopLevelItem[]>;
  /** A save was refused because someone else saved meanwhile: the editor asks what to do. */
  conflict: DesignConflict | null;
}

export function openDraft(start: DraftStart): DraftState {
  return { ...start, history: emptyHistory(), conflict: null };
}

/** An edit: the items replaced, which is an undo step (editHistory.ts: edits close in time are one). */
export function withEdit(draft: DraftState, items: TopLevelItem[], now: number): DraftState {
  return { ...draft, items, history: recordChange(draft.history, draft.items, now) };
}

export function withUndo(draft: DraftState): DraftState {
  const step = undo(draft.history, draft.items);
  return step ? { ...draft, items: step.value, history: step.history } : draft;
}

export function withRedo(draft: DraftState): DraftState {
  const step = redo(draft.history, draft.items);
  return step ? { ...draft, items: step.value, history: step.history } : draft;
}

/** The draft after `sent` was saved as `result`: edits made while it was saving stay unsaved. */
export function withSaved(draft: DraftState, sent: TopLevelItem[], result: { revision: number }): DraftState {
  return { ...draft, saved: sent, revision: result.revision, conflict: null };
}

export function withConflict(draft: DraftState, conflict: DesignConflict | null): DraftState {
  return { ...draft, conflict };
}

/** Whether the draft differs from what is saved (the order of keys, and editor keys, don't count). */
export function isDirty(draft: Pick<DraftState, "items" | "saved">): boolean {
  return canonicalJson(stripKeys(draft.items)) !== canonicalJson(stripKeys(draft.saved));
}

/** The conflict a failed save is about (the server's 409: someone saved the draft meanwhile), if that is why. */
export function conflictOf(error: unknown): DesignConflict | null {
  if (!(error instanceof ResearcherApiError) || error.code !== "design_conflict") return null;
  return DesignConflictSchema.parse(error.body);
}
