import type { DesignVersionMeta } from "@annotinder/contracts";

/**
 * Where each design version stands (docs/client.md §7):
 * - live:    the deployed version, what coders get. Frozen.
 * - draft:   the latest version, if it isn't frozen. What the editor and
 *            Preview work on.
 * - history: any other version. Read only, can be restored as the draft.
 */
type VersionStatus = "live" | "draft" | "history";

export interface DesignVersions {
  liveId: number | null;
  draftId: number | null;
  /** The version the editor opens by default: the draft, else the latest. */
  currentId: number | null;
  /** 1-based version number, in order of creation; null for unknown ids. */
  numberOf: (id: number) => number | null;
  statusOf: (id: number) => VersionStatus;
}

/** `designVersions` in order of creation, as `GET /design` returns them. */
export function describeVersions(designVersions: DesignVersionMeta[], liveId: number | null): DesignVersions {
  const latest = designVersions.at(-1) ?? null;
  const draftId = latest && !latest.immutable && latest.id !== liveId ? latest.id : null;
  const index = new Map(designVersions.map((c, i) => [c.id, i + 1]));
  return {
    liveId,
    draftId,
    currentId: draftId ?? latest?.id ?? null,
    numberOf: (id) => index.get(id) ?? null,
    statusOf: (id) => (id === liveId ? "live" : id === draftId ? "draft" : "history"),
  };
}

/**
 * How the opened version can be edited (docs/client.md §7):
 * - draft:   saving updates it (or creates it, for a new design version).
 * - live:    the live version, with no draft yet. Editable, but saving
 *            creates a new design version: the draft. Coders keep the live version.
 * - history: an older version, read only.
 */
export type DesignEditorMode = "draft" | "live" | "history";

/** The version open in the editor; `id` null: a new design, nothing saved yet. */
export interface OpenVersion {
  id: number | null;
  /** Whether it is frozen (deployed); unknown for a new design. */
  immutable?: boolean;
  /** It has unsaved edits: it stays open, and editable, whatever happens to the versions meanwhile. */
  pinned: boolean;
}

export function editorMode(open: OpenVersion, versions: DesignVersions): DesignEditorMode {
  if (open.id === null) return "draft";
  // An id that isn't listed yet was just created: it's the new current version
  const listed = versions.numberOf(open.id) !== null;
  if (listed && open.id !== versions.currentId && !open.pinned) return "history";
  return open.immutable ? "live" : "draft";
}

/**
 * The draft someone else made while the open version was being edited (a
 * colleague, an upload in another tab): saving the edits would pass it by,
 * so the editor asks first. Null if the draft is the open version, or there is none.
 */
export function draftMadeMeanwhile(
  open: OpenVersion,
  designVersions: DesignVersionMeta[],
  versions: DesignVersions,
): DesignVersionMeta | null {
  if (!open.pinned || versions.draftId === null || versions.draftId === open.id) return null;
  return designVersions.find((v) => v.id === versions.draftId) ?? null;
}
