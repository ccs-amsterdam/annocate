import type { DesignVersionMeta } from "@annotinder/contracts";

/**
 * Where each design version stands (docs/client.md §7):
 * - live:    the deployed version, what coders get. Frozen.
 * - draft:   the latest version, if it isn't frozen. What the editor and
 *            Preview work on.
 * - history: any other version. Read only, can be restored as the draft.
 */
export type VersionStatus = "live" | "draft" | "history";

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
