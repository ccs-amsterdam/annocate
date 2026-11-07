import { z } from "zod";
import { SafeNameSchema } from "../common.js";
import { SetGroupNameSchema } from "../sets.js";

// Session parameters (docs/plans/sets-and-session-parameters.md §3): what a
// link carries (link parameters, fixed in the link: one link per
// combination of their values) and what may be added to it (URL parameters,
// e.g. a panel's ids). All are `$session.<name>` values, stored on the
// session when it starts. Declared by the codebook's Session item, so the
// links follow from the codebook instead of being made by hand.

/** Session values that can't be declared: the participant id, the `source` URL parameter, the login's email. */
export const RESERVED_SESSION_NAMES = ["participant", "source", "email"] as const;

/** The longest value a session parameter takes (participant ids are short; it also bounds a pattern match). */
export const MAX_SESSION_VALUE = 256;

/** A URL parameter name, as it appears in links (e.g. `PROLIFIC_PID`). */
export const UrlParamNameSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_.~-]+$/, "A URL parameter name is letters, digits, _, -, . or ~");

/**
 * Why a pattern could make matching take very long (catastrophic
 * backtracking, a way to block the server with a crafted value), or null:
 * a repeated group that itself holds a repetition or an alternation
 * (`(a+)+`, `(a|ab)*`), or a backreference (`\1`). Character classes
 * (`[a-z0-9]+`), fixed repeats and plain alternation (`a|b|c`) are fine.
 */
export function slowPattern(pattern: string): string | null {
  // Per open group: whether it holds a repetition or an alternation
  const groups: { risky: boolean }[] = [{ risky: false }];
  let closedRisky = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    const quantifier = ch === "*" || ch === "+" || ch === "?" || (ch === "{" && /^\{\d*,?\d*\}/.test(pattern.slice(i)));
    if (quantifier) {
      // A repeated group that can match in many ways
      if (closedRisky && ch !== "?") return "a repeated group can't hold a repetition or alternatives";
      if (ch !== "?" || closedRisky) groups[groups.length - 1].risky = true;
      if (ch === "{") i = pattern.indexOf("}", i);
      closedRisky = false;
      continue;
    }
    closedRisky = false;
    if (ch === "\\") {
      if (/[1-9k]/.test(pattern[i + 1] ?? "")) return "backreferences aren't allowed";
      i++;
    } else if (ch === "[") {
      // A character class: skip to its end
      let j = i + 1;
      if (pattern[j] === "^") j++;
      if (pattern[j] === "]") j++;
      while (j < pattern.length && pattern[j] !== "]") j += pattern[j] === "\\" ? 2 : 1;
      i = j;
    } else if (ch === "(") {
      groups.push({ risky: false });
    } else if (ch === ")") {
      const group = groups.pop() ?? { risky: false };
      closedRisky = group.risky;
      if (group.risky) groups[groups.length - 1].risky = true;
    } else if (ch === "|") {
      groups[groups.length - 1].risky = true;
    }
  }
  return null;
}

/** A regular expression a URL parameter's value must match in full, e.g. `[0-9a-f]{24}` or `a|b|c`. */
export const UrlParamPatternSchema = z
  .string()
  .min(1)
  .max(256)
  .superRefine((p, ctx) => {
    try {
      new RegExp(p);
    } catch {
      ctx.addIssue({ code: "custom", message: "Not a valid regular expression" });
      return;
    }
    const slow = slowPattern(p);
    if (slow) ctx.addIssue({ code: "custom", message: `This pattern could make checking a value very slow: ${slow}` });
  });

/**
 * A session parameter's values: a list, the sets of a group (from the units'
 * data: a set-typed parameter, which an `assign` loop can take its set
 * from), or open (URL parameters only: any value up to 256 characters,
 * optionally matching a pattern).
 */
export const SessionValuesSchema = z.union([
  z.object({ list: z.array(z.object({ value: z.string().min(1).max(MAX_SESSION_VALUE), label: z.string().optional() })).min(1, "List at least one value") }),
  z.object({ sets: SetGroupNameSchema }),
  z.object({ open: z.object({ pattern: UrlParamPatternSchema.optional() }) }),
]);
export type SessionValues = z.infer<typeof SessionValuesSchema>;

/**
 * A session parameter. `link`: fixed in the link; every combination of the
 * link parameters' values gets a link (or the listed `combinations`).
 * `url`: added to the link as `?<param>=<value>` by whoever shares it;
 * required unless it has a `default`.
 */
export const SessionParamSchema = z
  .object({
    name: SafeNameSchema,
    kind: z.enum(["link", "url"]),
    values: SessionValuesSchema,
    /** URL parameters: the key in the link (default: the name). */
    param: UrlParamNameSchema.optional(),
    /** URL parameters: the value when the link has none (otherwise the parameter is required). */
    default: z.string().max(MAX_SESSION_VALUE).optional(),
    /** What it is, for the researcher (shown on the Invitations page). */
    description: z.string().max(500).optional(),
  })
  .refine((p) => !(RESERVED_SESSION_NAMES as readonly string[]).includes(p.name), {
    message: "participant, source and email are built in: choose another name",
    path: ["name"],
  })
  .refine((p) => p.kind === "url" || !("open" in p.values), { message: "A link parameter needs its values (a list, or a group's sets): links are made for each", path: ["values"] })
  .refine((p) => p.kind === "url" || (p.param === undefined && p.default === undefined), { message: "Only URL parameters have a URL key or a default", path: ["kind"] });
export type SessionParam = z.infer<typeof SessionParamSchema>;

/** The participant id from a URL parameter of the link (e.g. a panel's `PROLIFIC_PID`), required to start. */
export const ParticipantParamSchema = z.object({ param: UrlParamNameSchema, pattern: UrlParamPatternSchema.optional() });
export type ParticipantParam = z.infer<typeof ParticipantParamSchema>;

/**
 * What coders see about a study (the design's `public`, docs/plans/design.md
 * §2): its title, on the coder home and the coding screen. The study's
 * own name stays private (it may tell what the study is about). Room for a
 * description or a thumbnail later.
 */
export const PublicInfoSchema = z.object({
  /** The study's title, as coders see it. */
  title: z.string().trim().min(1).max(200),
});
export type PublicInfo = z.infer<typeof PublicInfoSchema>;

/**
 * The Study entry: the design's `session` (its parameters, the participant
 * id's URL parameter, and, if not every combination of the link parameters
 * is wanted, the combinations to make links for) and its `public` info, as
 * the first item of the design's items (`designItems`). Validation, the
 * runtime and the editor work on it there; it is stored as the design's
 * `session` and `public` (`splitDesignItems`).
 */
export const SessionItemSchema = z.object({
  type: z.literal("session"),
  label: z.string().optional(),
  params: z.array(SessionParamSchema).max(20),
  participant: ParticipantParamSchema.optional(),
  /** Link parameter values per link (name -> value); absent: every combination. */
  combinations: z.array(z.record(SafeNameSchema, z.string())).max(2000).optional(),
  /**
   * The sample size per link (docs/plans/design.md §4): each link takes at
   * most this many sessions. A link's own limit (the deployment's) overrides it.
   */
  maxUses: z.number().int().positive().optional(),
  /** The design's `public` (stored apart from the session). */
  public: PublicInfoSchema.optional(),
});
export type SessionItem = z.infer<typeof SessionItemSchema>;

/**
 * The design's `session` (docs/plans/design.md §2): how a coder's session
 * starts. Always there; without parameters `{ params: [] }`.
 */
export const SessionSpecSchema = SessionItemSchema.omit({ type: true, public: true });
export type SessionSpec = z.infer<typeof SessionSpecSchema>;

/** A session without parameters: the default. */
export const EMPTY_SESSION: SessionSpec = { params: [] };

/**
 * A design's items with the Study entry (its session and public info) as
 * the first item: what validation, the runtime and the editor work on.
 */
export function designItems<T>(design: { items: readonly T[]; session?: SessionSpec | null; public?: PublicInfo | null }): (T | SessionItem)[] {
  const study: SessionItem = { type: "session", ...(design.session ?? EMPTY_SESSION), ...(design.public ? { public: design.public } : {}) };
  return [study, ...design.items];
}

/** The other way round: the Study entry out of the items, into the design's `session` and `public`. */
export function splitDesignItems<T>(items: readonly T[]): { items: T[]; session: SessionSpec; public: PublicInfo | null } {
  const found = items.find((i) => (i as { type?: unknown } | null)?.type === "session") as SessionItem | undefined;
  const rest = items.filter((i) => i !== (found as unknown));
  if (!found) return { items: rest, session: EMPTY_SESSION, public: null };
  const { type: _type, public: info, ...session } = found;
  void _type;
  return { items: rest, session: session as SessionSpec, public: info ?? null };
}

/** The URL key of a URL parameter. */
export const sessionParamKey = (p: SessionParam) => p.param ?? p.name;

/** The Study entry among a design's items (`designItems`), if there. */
export function sessionItem(items: readonly unknown[]): SessionItem | null {
  const found = items.find((i) => (i as { type?: unknown } | null)?.type === "session");
  return (found as SessionItem | undefined) ?? null;
}

/** The names `$session` has under a codebook: its parameters and the built-in ones. */
export function sessionNames(items: readonly unknown[]): string[] {
  const params = sessionItem(items)?.params ?? [];
  return [...RESERVED_SESSION_NAMES, ...params.map((p) => p.name).filter((n): n is string => typeof n === "string")];
}

/** Set-typed session parameters: name -> group. */
export function setParameters(items: readonly unknown[]): Map<string, string> {
  const params = sessionItem(items)?.params ?? [];
  return new Map(params.flatMap((p) => (p?.values && "sets" in p.values ? [[p.name, p.values.sets] as [string, string]] : [])));
}

/**
 * The links a codebook's link parameters make: one per combination of their
 * values (or the listed `combinations`), each as name -> value. `setsOf`
 * gives a group's sets (from the units). One link (no values) without link
 * parameters.
 */
export function linkCombinations(item: SessionItem | null, setsOf: (group: string) => string[]): Record<string, string>[] {
  const linkParams = (item?.params ?? []).filter((p) => p.kind === "link");
  if (linkParams.length === 0) return [{}];
  const valuesOf = (p: SessionParam): string[] => ("list" in p.values ? p.values.list.map((v) => v.value) : "sets" in p.values ? setsOf(p.values.sets) : []);
  if (item?.combinations) {
    // Listed: those whose values still exist (a removed set's links are retired)
    return item.combinations.filter((c) => linkParams.every((p) => valuesOf(p).includes(c[p.name])));
  }
  let combos: Record<string, string>[] = [{}];
  for (const p of linkParams) combos = combos.flatMap((c) => valuesOf(p).map((v) => ({ ...c, [p.name]: v })));
  return combos;
}

/** A link's key: its parameter values in a canonical form (names sorted). */
export function linkKey(values: Record<string, string>): string {
  return JSON.stringify(Object.keys(values).sort().map((k) => [k, values[k]]));
}

/** Links above this many need a confirmation to deploy; more than `MAX_LINKS` can't be deployed. */
export const CONFIRM_LINKS = 500;
export const MAX_LINKS = 2000;
