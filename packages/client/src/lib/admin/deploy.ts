import { DEFAULT_REOPEN_MINUTES, type DesignVersion } from "@annotinder/contracts";
import type { DesignChange } from "../design/diff";

/**
 * The deploy panel's React key: one panel per design version. Not per
 * revision: saving the version's note while deploying bumps the revision, and
 * a new panel would lose "deploying" and the server's error.
 */
export function deployPanelKey(candidate: Pick<DesignVersion, "id"> | null): string {
  return candidate ? `version:${candidate.id}` : "none";
}

/**
 * "When coders finish" as the first deploy offers it: what the study's
 * Settings say if changed there (a new study has the default); otherwise open
 * for coders with their own link, who usually come back, and closed after a
 * day for a crowd.
 */
export function firstDeployReopenMinutes(studyReopenMinutes: number | null, crowd: boolean): number | null {
  if (studyReopenMinutes !== DEFAULT_REOPEN_MINUTES) return studyReopenMinutes;
  return crowd ? DEFAULT_REOPEN_MINUTES : null;
}

/** A React key per change: items without a name (two "Branch"es, two "Layout"s) share kind and name. */
export function changeKeys(changes: DesignChange[]): string[] {
  const seen = new Map<string, number>();
  return changes.map((change) => {
    const base = `${change.kind}:${change.name}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}:${count}`;
  });
}
