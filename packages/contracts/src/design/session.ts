import { z } from "zod";
import { SafeNameSchema } from "../common.js";
import { SetGroupNameSchema } from "../sets.js";
import { CriteriaSchema } from "./unitLoop.js";

// How coders come to a study (the Study entry, docs/architecture.md §6-7):
// the coder invitation (`invite`: specific coders with a link each or a
// login, or a crowd with one link), and the URL parameters a link may
// carry (context such as a distribution channel, or a panel's ids for its
// return link). All are `$session.<name>` values, stored on the session
// when it starts.

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
 * A URL parameter (docs/architecture.md §7): added to the link as
 * `?<param>=<value>` by whoever shares it (default key: the name), e.g. a
 * distribution channel or a panel's id for its return link. Required unless
 * it has a `default`. Its value may be any (up to 256 characters), match a
 * `pattern`, or be one of `values`.
 */
export const UrlParamSchema = z
  .object({
    name: SafeNameSchema,
    param: UrlParamNameSchema.optional(),
    values: z
      .array(z.object({ value: z.string().min(1).max(MAX_SESSION_VALUE), label: z.string().optional() }))
      .min(1, "List at least one value")
      .max(1000)
      .optional(),
    pattern: UrlParamPatternSchema.optional(),
    default: z.string().max(MAX_SESSION_VALUE).optional(),
    /** What it is, for the researcher. */
    description: z.string().max(500).optional(),
  })
  .refine((p) => !(RESERVED_SESSION_NAMES as readonly string[]).includes(p.name), {
    message: "participant, source, email and coder are built in: choose another name",
    path: ["name"],
  })
  .refine((p) => !(p.values && p.pattern), { message: "Give values or a pattern, not both", path: ["pattern"] });
export type UrlParam = z.infer<typeof UrlParamSchema>;

/** The participant id from a URL parameter of the link (e.g. a panel's `PROLIFIC_PID`), required to start. */
export const ParticipantParamSchema = z.object({
  param: UrlParamNameSchema,
  pattern: UrlParamPatternSchema.optional(),
});
export type ParticipantParam = z.infer<typeof ParticipantParamSchema>;

/**
 * Specific coders (docs/architecture.md §6.1): the units are divided over
 * coders by a set column; each of its values is a coder (`$session.coder`,
 * also the participant id). `link`: `per_coder`, a link each; `login`, one
 * link where coders sign in and get the units of their address (the
 * column's values are all email addresses).
 */
export const CodersInviteSchema = z.object({
  mode: z.literal("coders"),
  column: SetGroupNameSchema,
  link: z.enum(["per_coder", "login"]),
});
export type CodersInvite = z.infer<typeof CodersInviteSchema>;

/**
 * A crowd (docs/architecture.md §6.1): one link for everyone. The
 * participant id from a URL parameter (`participant`), or coders sign in
 * (`login`: their email is the participant id). `units`: a shared queue of
 * the units, handed out until done (without it, every coder gets all units).
 * `maxCoders`: the link takes at most this many sessions.
 */
export const CrowdInviteSchema = z.object({
  mode: z.literal("crowd"),
  participant: ParticipantParamSchema.optional(),
  login: z.boolean().optional(),
  units: CriteriaSchema.optional(),
  maxCoders: z.number().int().positive().optional(),
});
export type CrowdInvite = z.infer<typeof CrowdInviteSchema>;

/** How coders come to the study: specific coders, or a crowd (the default: one open link). */
export const InviteSchema = z.discriminatedUnion("mode", [CodersInviteSchema, CrowdInviteSchema]);
export type Invite = z.infer<typeof InviteSchema>;

/** Without an invitation: a crowd, one open link, every coder gets all units. */
export const DEFAULT_INVITE: Invite = { mode: "crowd" };

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
 * The Study entry: the design's `session` (the coder invitation, the URL
 * parameters and the normal end) and its `public` info, as
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

export const SessionItemSchema = z.object({
  type: z.literal("session"),
  label: z.string().optional(),
  /** How coders come to the study. Absent: a crowd with one open link. */
  invite: InviteSchema.optional(),
  /** The URL parameters a link may carry. */
  urlParams: z.array(UrlParamSchema).max(20).optional(),
  /** The study's normal end: its message and redirect. */
  end: StudyEndSchema.optional(),
  /** The design's `public` (stored apart from the session). */
  public: PublicInfoSchema.optional(),
});
export type SessionItem = z.infer<typeof SessionItemSchema>;

/**
 * The design's `session` (docs/architecture.md §6): how a coder's session
 * starts. Always there (`{}`: the defaults).
 */
export const SessionSpecSchema = SessionItemSchema.omit({ type: true, public: true });
export type SessionSpec = z.infer<typeof SessionSpecSchema>;

/** A session with the defaults: an open link for a crowd, no URL parameters. */
export const EMPTY_SESSION: SessionSpec = {};

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
export const urlParamKey = (p: UrlParam) => p.param ?? p.name;

/** The Study entry among a design's items (`designItems`), if there. */
export function sessionItem(items: readonly unknown[]): SessionItem | null {
  const found = items.find((i) => (i as { type?: unknown } | null)?.type === "session");
  return (found as SessionItem | undefined) ?? null;
}

/** A design's coder invitation (`DEFAULT_INVITE` without one). */
export const inviteOf = (item: SessionItem | null | undefined): Invite => item?.invite ?? DEFAULT_INVITE;

/** Whether coders must sign in to start: specific coders with a login, or a crowd that requires it. */
export function loginRequired(item: SessionItem | null | undefined): boolean {
  const invite = inviteOf(item);
  return invite.mode === "coders" ? invite.link === "login" : invite.login === true;
}

/** The names `$session` has under a design: its URL parameters and the built-in ones. */
export function sessionNames(items: readonly unknown[]): string[] {
  const named = (sessionItem(items)?.urlParams ?? []).map((p) => p?.name);
  return [...RESERVED_SESSION_NAMES, ...named.filter((n): n is string => typeof n === "string")];
}

/** A simple email address check (coder values: all or none are addresses). */
export const isEmail = (value: string) => /^[^\s@;#]+@[^\s@;#]+\.[^\s@;#]+$/.test(value);

/** Whether a coder column's values are email addresses: `email` (all), `link` (none), `mixed`, or `none` (no values yet). */
export function coderAccess(values: readonly string[]): "email" | "link" | "mixed" | "none" {
  if (values.length === 0) return "none";
  const emails = values.filter(isEmail).length;
  return emails === values.length ? "email" : emails === 0 ? "link" : "mixed";
}

/** The session values that select a session's units: the coder (`coder`, by the coder column), as session name -> column. */
export function sessionColumns(item: SessionItem | null): { name: string; column: string }[] {
  const invite = inviteOf(item);
  return invite.mode === "coders" ? [{ name: "coder", column: invite.column }] : [];
}

/**
 * The links a design makes, each as its values (name -> value): a link per
 * coder (specific coders with a link each), else one link (no values).
 * `setsOf` gives a set column's values (from the units, without reserved ones).
 */
export function linkCombinations(
  item: SessionItem | null,
  setsOf: (group: string) => string[],
): Record<string, string>[] {
  const invite = inviteOf(item);
  if (invite.mode === "coders" && invite.link === "per_coder") return setsOf(invite.column).map((coder) => ({ coder }));
  return [{}];
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
