import { z } from "zod";
import { SafeNameSchema } from "../common.js";
import { urlPatternError } from "./urlPattern.js";

// How coders come to a study (the Study entry, docs/architecture.md §6-7):
// the who codes (`invite`: expert coders with a link each, a
// login or names to pick, or a crowd with one link; the study's first deploy
// records which of the two, `coderKind`, and fixes it), and the URL
// parameters a link may
// carry (context such as a distribution channel, or a panel's ids for its
// return link). All are `$session.<name>` values, stored on the session
// when it starts.

/** Session values that can't be declared: the coder (who the coder is), and the `source` URL parameter. */
export const RESERVED_SESSION_NAMES = ["coder", "source"] as const;

/** The coder link's own query names (`/code/<study>?link=…`, a transfer, the return from logging in): no URL parameter can use them. */
export const RESERVED_URL_KEYS: readonly string[] = ["link", "transfer", "login"];

/** The longest value a session parameter takes (coder ids are short; it also bounds a pattern match). */
export const MAX_SESSION_VALUE = 256;

/** A URL parameter name, as it appears in links (e.g. `PROLIFIC_PID`). */
export const UrlParamNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_.~-]+$/, "A URL parameter name is letters, digits, _, -, . or ~");

/** A regular expression a URL parameter's value must match in full, e.g. `[0-9a-f]{24}` or `a|b|c` (urlPattern.ts). */
export const UrlParamPatternSchema = z
  .string()
  .min(1)
  .max(256)
  .superRefine((p, ctx) => {
    const problem = urlPatternError(p);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

/**
 * A URL parameter (docs/architecture.md §7): added to the link as
 * `?<param>=<value>` by whoever shares it (default key: the name), e.g. a
 * distribution channel or a panel's id for its return link. Required unless
 * it has a `default`. Its value may be any (up to 256 characters), match a
 * `pattern`, or be one of `values`.
 */
export const UrlParamSchema = z
  .strictObject({
    name: SafeNameSchema,
    param: UrlParamNameSchema.optional(),
    values: z
      .array(z.strictObject({ value: z.string().min(1).max(MAX_SESSION_VALUE), label: z.string().optional() }))
      .min(1, "List at least one value")
      .max(1000)
      .optional(),
    pattern: UrlParamPatternSchema.optional(),
    default: z.string().max(MAX_SESSION_VALUE).optional(),
    /** What it is, for the researcher. */
    description: z.string().max(500).optional(),
  })
  .refine((p) => !(RESERVED_SESSION_NAMES as readonly string[]).includes(p.name), {
    message: "coder and source are built in: choose another name",
    path: ["name"],
  })
  .refine((p) => !(p.values && p.pattern), { message: "Give values or a pattern, not both", path: ["pattern"] });
export type UrlParam = z.infer<typeof UrlParamSchema>;

/**
 * The coder's id from a URL parameter of the link (e.g. a panel's
 * `PROLIFIC_PID`): `$session.coder`. Required to start, unless `optional`.
 */
export const CoderParamSchema = z.strictObject({
  param: UrlParamNameSchema,
  pattern: UrlParamPatternSchema.optional(),
  optional: z.boolean().optional(),
});
export type CoderParam = z.infer<typeof CoderParamSchema>;

/**
 * Who codes in a study, and who a coder is: the researchers' expert coders,
 * or a crowd. The design's invitation chooses (`inviteKind`); the study's
 * first deploy records the deployed design's kind (`StudyResponse.coderKind`,
 * null before it) and fixes it: from then on its designs' invitation is for
 * that kind (`coderKindProblem`).
 */
export const CoderKindSchema = z.enum(["expert", "crowd"]);
export type CoderKind = z.infer<typeof CoderKindSchema>;

/**
 * Expert coders (docs/architecture.md §6.1): who codes which units is the
 * units' `coder_set` column; each of its values is one of the study's
 * expert coders, by their coder id (`$session.coder`, also when the design
 * has no unit loop: e.g. a survey of known experts). Overlap units
 * (`test_set`) are everyone's.
 * `link`: `per_coder`, a link each; `login`, one link where coders sign in
 * and get the units of the coder with their email address (each coder with
 * units has one); `pick_name`, one link where coders pick their id from the
 * column's values (shown to anyone with the link: names, not addresses).
 * `nameDevices` (with `pick_name`): `first`, a name is the first device's
 * that picks it (others can't pick it again; the default); `any`, any device
 * that picks a name continues its session (e.g. a team sharing devices).
 * Until the units have a `coder_set` column there are no coders: the draft
 * saves, deploying can't.
 */
export const CodersInviteSchema = z.strictObject({
  mode: z.literal("coders"),
  link: z.enum(["per_coder", "login", "pick_name"]),
  nameDevices: z.enum(["first", "any"]).optional(),
});
export type CodersInvite = z.infer<typeof CodersInviteSchema>;

/**
 * A crowd (docs/architecture.md §6.1), also for surveys and survey
 * experiments: one link for everyone. Who the coder is (`$session.coder`):
 * from a URL parameter (`coderParam`), else nobody. A crowd never has to
 * sign in. Whether the units are divided among the coders is each loop's
 * (unitLoop.ts `divide`). `maxCoders`: the link takes at most this many
 * sessions.
 */
export const CrowdInviteSchema = z.strictObject({
  mode: z.literal("crowd"),
  coderParam: CoderParamSchema.optional(),
  maxCoders: z.number().int().positive().optional(),
});
export type CrowdInvite = z.infer<typeof CrowdInviteSchema>;

/** How coders come to the study (who codes): expert coders, or a crowd (one link). */
export const InviteSchema = z.discriminatedUnion("mode", [CodersInviteSchema, CrowdInviteSchema]);
export type Invite = z.infer<typeof InviteSchema>;

/** A crowd's invitation with the defaults: one open link. */
export const CROWD_INVITE: CrowdInvite = { mode: "crowd" };

/** The invitation a kind of coders starts with: a crowd's open link, or a link per expert coder. */
export const firstInvite = (kind: CoderKind): Invite =>
  kind === "expert" ? { mode: "coders", link: "per_coder" } : CROWD_INVITE;

/** The kind of coders an invitation is for. */
export const inviteKind = (invite: Invite): CoderKind => (invite.mode === "coders" ? "expert" : "crowd");

/**
 * What coders see about a study (the design's `public`, docs/glossary.md
 * §2): its title, on the coder home and the coding screen. The study's
 * own name stays private (it may tell what the study is about). Room for a
 * description or a thumbnail later.
 */
export const PublicInfoSchema = z.strictObject({
  /** The study's title, as coders see it. */
  title: z.string().trim().min(1).max(200),
});
export type PublicInfo = z.infer<typeof PublicInfoSchema>;

/**
 * The study's normal end (the Study entry's `end`): what coders see when
 * they get through the whole design, and where they are sent, e.g. a
 * panel's return link. End items in the design are for ending early. Coders
 * get it as an end item named `_end` after the last item (`toCoderItems`).
 */
export const StudyEndSchema = z.strictObject({
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
 * How the coding screen looks (docs/client.md §4 "Display"). `layouts`:
 * `fixed` (default), an "auto" layout follows the options only, the same for
 * every coder; `responsive`, it also follows the screen and the coder's keys
 * (with the numpad: 3-column grids), and the numpad is available. Layouts a
 * researcher picked are kept either way. `theme`: `coder` (default) lets
 * coders choose light or dark; `light` / `dark` for everyone (e.g. images
 * made for one background).
 */
export const DisplaySchema = z.strictObject({
  layouts: z.enum(["fixed", "responsive"]).optional(),
  theme: z.enum(["coder", "light", "dark"]).optional(),
  /**
   * Where coders may choose answers with keys (their answer shortcuts, which
   * they turn on themselves): `false` turns them off for the questions about
   * the coder (outside unit loops) or the questions about units. Absent:
   * allowed. Moving, Space / Enter and the Ctrl commands always work.
   */
  answerKeys: z
    .strictObject({ coderQuestions: z.boolean().optional(), unitQuestions: z.boolean().optional() })
    .optional(),
});
export type Display = z.infer<typeof DisplaySchema>;

/**
 * The Study entry: the design's `session` (the who codes, the URL
 * parameters and the normal end) and its `public` info, as
 * the first item of the design's items (`designItems`). Validation, the
 * runtime and the editor work on it there; it is stored as the design's
 * `session` and `public` (`splitDesignItems`).
 */
export const SessionItemSchema = z.strictObject({
  type: z.literal("session"),
  label: z.string().optional(),
  /** How coders come to the study (who codes). Absent: not chosen yet (`inviteOf`). */
  invite: InviteSchema.optional(),
  /** The URL parameters a link may carry. */
  urlParams: z.array(UrlParamSchema).max(20).optional(),
  /** The study's normal end: its message and redirect. */
  end: StudyEndSchema.optional(),
  /** How the coding screen looks: layouts fixed or responsive, the theme. */
  display: DisplaySchema.optional(),
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

/** A session with the defaults: who codes not chosen yet, no URL parameters. */
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

/**
 * Who codes (the design's invitation): expert coders or a crowd. null: not
 * chosen yet. A design can't be deployed without it (`deployErrors`);
 * previews run it as a crowd.
 */
export const inviteOf = (item: Pick<SessionItem, "invite"> | null | undefined): Invite | null => item?.invite ?? null;

/** Whether coders must sign in to start: expert coders with a login. A crowd never has to. */
export function loginRequired(item: SessionItem | null | undefined): boolean {
  const invite = inviteOf(item);
  return invite?.mode === "coders" && invite.link === "login";
}

/**
 * What is wrong when a design's invitation isn't for the kind of coders the
 * study's first deploy fixed (`coderKind`), or null. A design that hasn't
 * chosen who codes yet has no such problem (deploying asks for the choice,
 * `deployErrors`).
 */
export function coderKindProblem(
  item: Pick<SessionItem, "invite"> | null | undefined,
  coderKind: CoderKind,
): string | null {
  const invite = inviteOf(item);
  if (invite === null || inviteKind(invite) === coderKind) return null;
  return coderKind === "expert"
    ? 'This study has expert coders since its first deploy, but the design invites a crowd: choose how the expert coders get in (session.invite with mode "coders")'
    : 'This study has a crowd since its first deploy, but the design invites expert coders: use a crowd\'s invitation (session.invite with mode "crowd")';
}

/** The names `$session` has under a design: its URL parameters and the built-in ones. */
export function sessionNames(items: readonly unknown[]): string[] {
  const named = (sessionItem(items)?.urlParams ?? []).map((p) => p?.name);
  return [...RESERVED_SESSION_NAMES, ...named.filter((n): n is string => typeof n === "string")];
}

/** A simple email address check. */
export const isEmail = (value: string) => /^[^\s@;#]+@[^\s@;#]+\.[^\s@;#]+$/.test(value);

/** The most sessions a link takes: a crowd's limit. */
export function linkMaxCoders(item: SessionItem | null | undefined): number | undefined {
  const invite = inviteOf(item);
  return invite?.mode === "crowd" ? invite.maxCoders : undefined;
}

/**
 * The links a design makes, each as its values (name -> value): a link per
 * coder (expert coders with a link each; `coders`: the `coder_set`
 * column's values), else one link (no values).
 */
export function linkCombinations(item: SessionItem | null, coders: readonly string[]): Record<string, string>[] {
  const invite = inviteOf(item);
  if (invite?.mode === "coders" && invite.link === "per_coder") return coders.map((coder) => ({ coder }));
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
