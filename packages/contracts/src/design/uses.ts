import { sessionItem, type DesignUses } from "./session.js";

// What a design is made of (the Study entry's `uses`, docs/client.md §5
// "Editor modes"): the editor shows only what a design needs, and a choice
// that would hide something the design has is blocked, with what is in the way.

type Path = (string | number)[];
type RawItem = {
  type?: unknown;
  name?: unknown;
  label?: unknown;
  children?: unknown;
  variable?: { type?: unknown } | undefined;
};

/** Something in the design that a choice of `uses` doesn't allow, and where. */
export interface UsesConflict {
  message: string;
  path: Path;
}

const list = (value: unknown): RawItem[] =>
  Array.isArray(value) ? value.filter((v): v is RawItem => !!v && typeof v === "object") : [];

/** How messages name an item. */
function itemTitle(item: RawItem, loopNumber?: number): string {
  if (item.type === "unit_loop")
    return typeof item.label === "string" && item.label.trim()
      ? `unit loop '${item.label.trim()}'`
      : `unit loop ${loopNumber ?? ""}`.trim();
  if (item.type === "show_if") return "a Show if item";
  const kind = item.type === "computed" ? "computed item" : item.type === "end" ? "end item" : "question";
  return typeof item.name === "string" ? `${kind} '${item.name}'` : kind;
}

/** The top-level items, with their paths (the Study entry left out). */
function topLevel(items: readonly unknown[]): { item: RawItem; path: Path }[] {
  return list(items)
    .map((item, i) => ({ item, path: [i] as Path }))
    .filter(({ item }) => item.type !== "session");
}

/** Every item, through conditions and loops, with its path. */
function everyItem(items: readonly unknown[], path: Path = []): { item: RawItem; path: Path }[] {
  return list(items).flatMap((item, i) => [
    { item, path: [...path, i] },
    ...everyItem(list(item.children), [...path, i, "children"]),
  ]);
}

/** The design's `uses` as declared, else worked out from what it has. */
export function designUses(items: readonly unknown[]): DesignUses {
  return sessionItem(items as never)?.uses ?? inferUses(items);
}

/**
 * What a design without `uses` is made of: `annotate` if it is one unit
 * loop and nothing outside it, `questions` if it has no loops, else `both`
 * (also an empty design: everything shown); an experiment if it has
 * conditions not linked to units, or computed items.
 */
export function inferUses(items: readonly unknown[]): DesignUses {
  const top = topLevel(items);
  const loops = top.filter(({ item }) => item.type === "unit_loop").length;
  const outside = top.length - loops;
  const session = sessionItem(items as never);
  const experiment =
    (session?.conditions ?? []).some((c) => !c.units) || everyItem(items).some(({ item }) => item.type === "computed");
  const content = loops === 1 && outside === 0 ? "annotate" : loops === 0 && outside > 0 ? "questions" : "both";
  return { content, experiment };
}

/** What in the design a choice of `uses` doesn't allow (empty: the choice fits). */
export function usesConflicts(uses: DesignUses, items: readonly unknown[]): UsesConflict[] {
  const conflicts: UsesConflict[] = [];
  const session = sessionItem(items as never);
  const sessionPath: Path = [list(items).findIndex((i) => i.type === "session")];
  const top = topLevel(items);
  let loopNumber = 0;
  const loops = top.filter(({ item }) => item.type === "unit_loop");

  if (uses.content === "annotate") {
    for (const { item, path } of top) {
      if (item.type === "unit_loop") {
        loopNumber += 1;
        if (loopNumber > 1)
          conflicts.push({ path, message: `${itemTitle(item, loopNumber)}: annotating only has one unit loop` });
      } else {
        conflicts.push({ path, message: `${itemTitle(item)} is outside the unit loop` });
      }
    }
  }
  if (uses.content === "questions") {
    loops.forEach(({ item, path }, i) =>
      conflicts.push({ path, message: `${itemTitle(item, i + 1)}: questions only have no units` }),
    );
    if (session?.coders)
      conflicts.push({ path: [...sessionPath, "coders"], message: "who codes which units (the coder column)" });
    session?.conditions?.forEach((c, i) => {
      if (c.units)
        conflicts.push({
          path: [...sessionPath, "conditions", i, "units"],
          message: `condition '${c.name}' selects units`,
        });
    });
  }
  if (!uses.experiment) {
    // A condition linked to a set column says which units a session gets: that's annotating
    session?.conditions?.forEach((c, i) => {
      if (!c.units) conflicts.push({ path: [...sessionPath, "conditions", i], message: `condition '${c.name}'` });
    });
    for (const { item, path } of everyItem(items))
      if (item.type === "computed") conflicts.push({ path, message: itemTitle(item) });
  }
  return conflicts;
}
