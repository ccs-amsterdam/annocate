import { MAX_SESSION_VALUE, sessionParamKey, type SessionItem } from "@annotinder/contracts";
import { HttpError } from "../shared/http.js";

// A new session's `$session` values (docs/plans/sets-and-session-parameters.md
// §3): the link's parameters, the URL parameters the codebook declares,
// `source`, and the participant id. Fixed when the session starts.

/** What the codebook asks of a new session, and the sets its values may name. */
export interface SessionRules {
  item: SessionItem | null;
  /** A group's sets (names, without reserved ones). */
  setsOf: (group: string) => string[];
  /** Groups whose set is the login's email (`assign` from `{ session: "email" }`): only those emails may start. */
  emailGroups: string[];
}

/** Whether a value fits a pattern (in full). */
const fits = (value: string, pattern?: string) => !pattern || new RegExp(`^(?:${pattern})$`).test(value);

/**
 * The participant id and `$session` values of a new session. A missing
 * required URL parameter or one with a value the codebook doesn't accept is
 * refused (400 `url_param_missing` / `url_param_invalid`), so such a link
 * doesn't start. With email-assigned sets, only their emails may start
 * (401 `auth_required` without a login, 403 `email_not_invited`).
 */
export function sessionValues(
  rules: SessionRules,
  link: { params: Record<string, string>; participantId: string | null },
  urlParams: Record<string, string>,
  email: string | null,
): { participantId: string | null; session: Record<string, string> } {
  const read = (key: string) => {
    const value = urlParams[key]?.trim();
    if (value && value.length > MAX_SESSION_VALUE) throw new HttpError(400, `The URL parameter "${key}" is too long`, "url_param_invalid");
    return value || undefined;
  };
  const invalid = (key: string) => new HttpError(400, `The URL parameter "${key}" has a value this link doesn't accept`, "url_param_invalid");

  const session: Record<string, string> = {};
  for (const p of rules.item?.params ?? []) {
    if (p.kind === "link") {
      if (link.params[p.name] !== undefined) session[p.name] = link.params[p.name];
      continue;
    }
    const key = sessionParamKey(p);
    const value = read(key) ?? p.default;
    if (value === undefined) throw new HttpError(400, `This link needs the URL parameter "${key}"`, "url_param_missing");
    const ok =
      "list" in p.values
        ? p.values.list.some((v) => v.value === value)
        : "sets" in p.values
          ? rules.setsOf(p.values.sets).includes(value)
          : fits(value, p.values.open.pattern);
    if (!ok) throw invalid(key);
    session[p.name] = value;
  }
  const source = read("source");
  if (source !== undefined) session.source = source;

  let participantId = link.participantId;
  const participant = rules.item?.participant;
  if (participant) {
    const value = read(participant.param);
    if (value === undefined) throw new HttpError(400, `This link needs the URL parameter "${participant.param}"`, "url_param_missing");
    if (!fits(value, participant.pattern)) throw invalid(participant.param);
    participantId = value;
  }

  if (rules.emailGroups.length > 0) {
    if (!email) throw new HttpError(401, "This study requires login", "auth_required");
    const lower = email.toLowerCase();
    const known = rules.emailGroups.every((g) => rules.setsOf(g).some((s) => s.toLowerCase() === lower));
    if (!known) throw new HttpError(403, "This email address has no access to this study", "email_not_invited");
  }
  return { participantId, session };
}

/**
 * A preview session's values: like a link's, but never refused. Values come
 * from the preview page's URL parameters (link parameters too, by name),
 * else the default or first value.
 */
export function previewSessionValues(rules: SessionRules, urlParams: Record<string, string>): Record<string, string> {
  const session: Record<string, string> = {};
  for (const p of rules.item?.params ?? []) {
    const given = urlParams[p.kind === "url" ? sessionParamKey(p) : p.name]?.trim().slice(0, MAX_SESSION_VALUE);
    const first = "list" in p.values ? p.values.list[0]?.value : "sets" in p.values ? rules.setsOf(p.values.sets)[0] : undefined;
    const value = given || (p.kind === "url" ? p.default : undefined) || first;
    if (value !== undefined) session[p.name] = value;
  }
  const participant = rules.item?.participant && urlParams[rules.item.participant.param]?.trim();
  if (participant) session.participant = participant.slice(0, MAX_SESSION_VALUE);
  return session;
}
