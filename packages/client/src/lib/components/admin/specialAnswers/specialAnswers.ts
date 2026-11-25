import type { SpecialAnswer, SpecialKind } from "@annotinder/contracts";

/** The grid of a list of options and special answers: key, label, code, (colour), buttons. */
export const SPECIAL_GRID = "grid grid-cols-[auto_1fr_8rem_auto_auto] items-center gap-1.5";

/** Special answers as stored: none is undefined. */
export function withSpecials(list: SpecialAnswer[]): SpecialAnswer[] | undefined {
  return list.length ? list : undefined;
}

/** One special answer changed; an empty label or code is left out. */
export function patchSpecial(list: SpecialAnswer[], kind: SpecialKind, patch: Partial<SpecialAnswer>) {
  return list.map((s) => {
    if (s.kind !== kind) return s;
    const next = { ...s, ...patch };
    if (next.label === undefined) delete next.label;
    if (next.value === undefined) delete next.value;
    return next;
  });
}
