import { z } from "zod";
import { SafeNameSchema } from "../common.js";
import { SetGroupNameSchema } from "../sets.js";

// Session parameters (docs/architecture.md §7), coders
// and assigned conditions (docs/architecture.md §6): what a
// link carries (link parameters, fixed in the link: one link per
// combination of their values) and what may be added to it (URL parameters,
// e.g. a panel's ids). All are `$session.<name>` values, stored on the
// session when it starts. Declared by the design's Session item, so the
// links follow from the design instead of being made by hand.

/** Session values that can't be declared: the participant id, the `source` URL parameter, the login's email, the coder (`session.coders`). */
export const RESERVED_SESSION_NAMES = ["participant", "source", "email", "coder"] as const;

/** The longest value a session parameter takes (participant ids are short; it also bounds a pattern match). */
export const MAX_SESSION_VALUE = 256;

/** A URL parameter name, as it appears in links (e.g. `PROLIFIC_PID`). */
export const UrlParamNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_.~-]+$/, "A URL parameter name is letters, digits, _, -, . or ~");

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
 * A session parameter's values: a list, or open (URL parameters only: any
 * value up to 256 characters, optionally matching a pattern).
 */
export const SessionValuesSchema = z.union([
  z.object({
    list: z
      .array(z.object({ value: z.string().min(1).max(MAX_SESSION_VALUE), label: z.string().optional() }))
      .min(1, "List at least one value"),
  }),
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
    message: "participant, source, email and coder are built in: choose another name",
    path: ["name"],
  })
  .refine((p) => p.kind === "url" || !("open" in p.values), {
    message: "A link parameter needs a list of values: links are made for each",
    path: ["values"],
  })
  .refine((p) => p.kind === "url" || (p.param === undefined && p.default === undefined), {
    message: "Only URL parameters have a URL key or a default",
    path: ["kind"],
  });
export type SessionParam = z.infer<typeof SessionParamSchema>;

/** The participant id from a URL parameter of the link (e.g. a panel's `PROLIFIC_PID`), required to start. */
export const ParticipantParamSchema = z.object({
  param: UrlParamNameSchema,
  pattern: UrlParamPatternSchema.optional(),
});
export type ParticipantParam = z.infer<typeof ParticipantParamSchema>;

/**
 * Coders (docs/architecture.md §6.1): the units are divided over
 * coders by a set column; each of its values is a coder (`$session.coder`).
 * All values email addresses: one link, and coders sign in (they get the
 * units of their address). No email addresses: a link per coder.
 */
export const CodersSpecSchema = z.object({ column: SetGroupNameSchema });
export type CodersSpec = z.infer<typeof CodersSpecSchema>;

/** A value of a condition (also a set name when the condition is linked to a column). */
export const ConditionValueSchema = z
  .string()
  .min(1)
  .max(128)
  .refine(
    (s) => !/[;#]/.test(s) && s.trim() === s && !s.startsWith("_"),
    "A value has no ; or #, no spaces at its ends, and doesn't start with _",
  );

/**
 * An assigned condition (docs/architecture.md §6.1): a session value (`$session.<name>`) with
 * fixed values or, linked to a set column, the column's values (`free`).
 * `assign: "link"`: a link per value. `random`: one link, the value drawn
 * when the session starts (`draw`: `balanced`, the default, the value the
 * fewest sessions have; or `random`). With `units` (a set column) the value
 * selects the session's units: those whose cell holds it.
 */
export const ConditionSpecSchema = z
  .object({
    name: SafeNameSchema,
    values: z.union([z.array(ConditionValueSchema).min(1, "List at least one value").max(1000), z.literal("free")]),
    assign: z.enum(["link", "random"]),
    draw: z.enum(["balanced", "random"]).optional(),
    units: SetGroupNameSchema.optional(),
    /** What it is, for the researcher. */
    description: z.string().max(500).optional(),
  })
  .refine((c) => c.values !== "free" || c.units !== undefined, {
    message: "Free values come from a set column: link the condition to one",
    path: ["values"],
  })
  .refine((c) => c.assign === "random" || c.draw === undefined, {
    message: "Only a random assignment draws",
    path: ["draw"],
  })
  .refine((c) => c.values === "free" || new Set(c.values).size === c.values.length, {
    message: "A value is listed twice",
    path: ["values"],
  })
  .refine((c) => !(RESERVED_SESSION_NAMES as readonly string[]).includes(c.name), {
    message: "participant, source, email and coder are built in: choose another name",
    path: ["name"],
  });
export type ConditionSpec = z.infer<typeof ConditionSpecSchema>;

/**
 * What coders see about a study (the design's `public`, docs/glossary.md
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
/**
 * The study's normal end (the Study entry's `end`): what coders see when
 * they get through the whole design, and where they are sent, e.g. a
 * panel's return link. End items in the design are for ending early. Coders
 * get it as an end item named `_end` after the last item (`toCoderItems`).
 */
export const StudyEndSchema = z.object({
  message: z.string().optional().describe("Shown at the end: a markdown template like a question text."),
  redirectUrl: z
    .string()
    .optional()
    .describe("Where to send the coder, e.g. a panel's return link. May contain $var references (URL-encoded)."),
  redirectSetting: SafeNameSchema.optional().describe(
    "Instead of redirectUrl: the name of a deployment setting holding the URL (the study's settings).",
  ),
});
export type StudyEnd = z.infer<typeof StudyEndSchema>;

/** The end item coders get for the study's normal end (`StudyEndSchema`). Reserved: no item may have this name. */
export const STUDY_END_NAME = "_end";

/**
 * What a design is made of (the Study entry's `uses`), so the editor shows
 * only what it needs (docs/client.md §5, "Editor modes"):
 * - `content`: `annotate` (one unit loop, nothing outside it), `questions`
 *   (no unit loops, no units), or `both`;
 * - `experiment`: conditions that don't select units, and computed items
 *   (a condition linked to a set column says which units a session gets:
 *   part of annotating).
 * Left out: worked out from the design (`inferUses`).
 */
export const DesignUsesSchema = z.object({
  content: z.enum(["annotate", "questions", "both"]),
  experiment: z.boolean(),
});
export type DesignUses = z.infer<typeof DesignUsesSchema>;

export const SessionItemSchema = z.object({
  type: z.literal("session"),
  label: z.string().optional(),
  params: z.array(SessionParamSchema).max(20),
  /** Units are divided over coders, by this set column. */
  coders: CodersSpecSchema.optional(),
  /** Assigned conditions: per link, or drawn when the session starts. */
  conditions: z.array(ConditionSpecSchema).max(10).optional(),
  participant: ParticipantParamSchema.optional(),
  /** Link parameter values per link (name -> value); absent: every combination. */
  combinations: z.array(z.record(SafeNameSchema, z.string())).max(2000).optional(),
  /**
   * The sample size per link (docs/architecture.md §5): each link takes at
   * most this many sessions. A link's own limit (the deployment's) overrides it.
   */
  maxUses: z.number().int().positive().optional(),
  /** The study's normal end: its message and redirect. */
  end: StudyEndSchema.optional(),
  /** What the design is made of, for the editor. */
  uses: DesignUsesSchema.optional(),
  /** The design's `public` (stored apart from the session). */
  public: PublicInfoSchema.optional(),
});
export type SessionItem = z.infer<typeof SessionItemSchema>;

/**
 * The design's `session` (docs/architecture.md §6): how a coder's session
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
export function designItems<T>(design: {
  items: readonly T[];
  session?: SessionSpec | null;
  public?: PublicInfo | null;
}): (T | SessionItem)[] {
  const study: SessionItem = {
    type: "session",
    ...(design.session ?? EMPTY_SESSION),
    ...(design.public ? { public: design.public } : {}),
  };
  return [study, ...design.items];
}

/** The other way round: the Study entry out of the items, into the design's `session` and `public`. */
export function splitDesignItems<T>(items: readonly T[]): {
  items: T[];
  session: SessionSpec;
  public: PublicInfo | null;
} {
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

/** The names `$session` has under a design: its parameters, its conditions and the built-in ones. */
export function sessionNames(items: readonly unknown[]): string[] {
  const item = sessionItem(items);
  const named = [...(item?.params ?? []), ...(item?.conditions ?? [])].map((p) => p?.name);
  return [...RESERVED_SESSION_NAMES, ...named.filter((n): n is string => typeof n === "string")];
}

/** A simple email address check (coder values: all or none are addresses). */
export const isEmail = (value: string) => /^[^\s@;#]+@[^\s@;#]+\.[^\s@;#]+$/.test(value);

/**
 * How coders get in, from their values (the coder column's sets): `email`,
 * all are addresses (one link, sign in); `link`, none are (a link each);
 * `mixed` (an error at deploy); `none`, no values (yet).
 */
export function coderAccess(values: readonly string[]): "email" | "link" | "mixed" | "none" {
  if (values.length === 0) return "none";
  const emails = values.filter(isEmail).length;
  return emails === values.length ? "email" : emails === 0 ? "link" : "mixed";
}

/** A condition's values: its list, or (free) its column's values. */
export function conditionValues(
  condition: Pick<ConditionSpec, "values" | "units">,
  setsOf: (group: string) => string[],
): string[] {
  return condition.values === "free" ? (condition.units ? setsOf(condition.units) : []) : condition.values;
}

/**
 * The session values that select a session's units: the coder (`coder`,
 * by the coder column) and the conditions linked to a set column, each as
 * session name -> column.
 */
export function sessionColumns(item: SessionItem | null): { name: string; column: string }[] {
  return [
    ...(item?.coders ? [{ name: "coder", column: item.coders.column }] : []),
    ...(item?.conditions ?? []).flatMap((c) => (c.units ? [{ name: c.name, column: c.units }] : [])),
  ];
}

/**
 * The links a design makes: one per combination of the coders (when they
 * don't sign in), the values of conditions assigned per link, and the
 * values of its link parameters (or the listed `combinations` of those),
 * each as name -> value. `setsOf` gives a set column's values (from the
 * units, without reserved ones). One link (no values) without any.
 */
export function linkCombinations(
  item: SessionItem | null,
  setsOf: (group: string) => string[],
): Record<string, string>[] {
  const dimensions: { name: string; values: string[] }[] = [];
  if (item?.coders) {
    const coders = setsOf(item.coders.column);
    if (coderAccess(coders) === "link") dimensions.push({ name: "coder", values: coders });
  }
  for (const c of item?.conditions ?? [])
    if (c.assign === "link") dimensions.push({ name: c.name, values: conditionValues(c, setsOf) });
  const linkParams = (item?.params ?? []).filter((p) => p.kind === "link");
  const valuesOf = (p: SessionParam): string[] => ("list" in p.values ? p.values.list.map((v) => v.value) : []);
  let params: Record<string, string>[];
  if (item?.combinations && linkParams.length > 0) {
    params = item.combinations.filter((c) => linkParams.every((p) => valuesOf(p).includes(c[p.name])));
  } else {
    params = [{}];
    for (const p of linkParams) params = params.flatMap((c) => valuesOf(p).map((v) => ({ ...c, [p.name]: v })));
  }
  let combos: Record<string, string>[] = [{}];
  for (const d of dimensions) combos = combos.flatMap((c) => d.values.map((v) => ({ ...c, [d.name]: v })));
  return combos.flatMap((c) => params.map((p) => ({ ...c, ...p })));
}

/** A link's key: its parameter values in a canonical form (names sorted). */
export function linkKey(values: Record<string, string>): string {
  return JSON.stringify(
    Object.keys(values)
      .sort()
      .map((k) => [k, values[k]]),
  );
}

/** Links above this many need a confirmation to deploy; more than `MAX_LINKS` can't be deployed. */
export const CONFIRM_LINKS = 500;
export const MAX_LINKS = 2000;
