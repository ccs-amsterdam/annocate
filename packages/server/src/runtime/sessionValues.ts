import { MAX_SESSION_VALUE, coderAccess, conditionValues, sessionParamKey, type SessionItem, type SignIn } from "@annotinder/contracts";
import { HttpError } from "../shared/http.js";

// A new session's `$session` values (docs/plans/sets-and-session-parameters.md
// §3, docs/plans/unit-assignment.md): the link's parameters, the coder (by
// link or by the login's email), conditions assigned by link, the URL
// parameters the codebook declares, `source`, and the participant id. Fixed
// when the session starts; conditions drawn at the start are drawn by the
// store (`draws`), under a lock.

/** What the codebook asks of a new session, and the set columns' values. */
export interface SessionRules {
  item: SessionItem | null;
  /** A set column's values (its sets, without reserved ones). */
  setsOf: (group: string) => string[];
  /** Whether coders sign in (the study's setting). */
  signIn: SignIn;
}

/** A condition to draw when the session starts (`assign: "random"`): its values, and how. */
export interface SessionDraw {
  name: string;
  values: string[];
  draw: "balanced" | "random";
}

/** How coders get in: by email (sign in) when the coder column's values are email addresses. */
export const emailCoders = (rules: SessionRules) => !!rules.item?.coders && coderAccess(rules.setsOf(rules.item.coders.column)) === "email";

/** Whether a new session needs a login: the study requires it, or coders are email addresses. */
export const loginRequired = (rules: SessionRules) => rules.signIn === "required" || emailCoders(rules);

/** Whether a value fits a pattern (in full). */
const fits = (value: string, pattern?: string) => !pattern || new RegExp(`^(?:${pattern})$`).test(value);

/**
 * The participant id and `$session` values of a new session. A missing
 * required URL parameter or one with a value the codebook doesn't accept is
 * refused (400 `url_param_missing` / `url_param_invalid`), so such a link
 * doesn't start. With email coders only their emails may start, and with
 * sign-in required only logins (401 `auth_required` without a login, 403
 * `email_not_allowed`). A link's coder or condition value that is no longer
 * one: 403 `link_inactive`.
 */
export function sessionValues(
  rules: SessionRules,
  link: { params: Record<string, string>; participantId: string | null },
  urlParams: Record<string, string>,
  email: string | null,
): { participantId: string | null; session: Record<string, string>; draws: SessionDraw[] } {
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
    const ok = "list" in p.values ? p.values.list.some((v) => v.value === value) : fits(value, p.values.open.pattern);
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

  if (loginRequired(rules) && !email) throw new HttpError(401, "This study requires login", "auth_required");
  const inactive = () => new HttpError(403, "This link is no longer active", "link_inactive");
  // The coder: the login's email (email coders) or the link's
  const coders = rules.item?.coders;
  if (coders) {
    const values = rules.setsOf(coders.column);
    if (emailCoders(rules)) {
      const lower = email!.toLowerCase();
      const coder = values.find((v) => v.toLowerCase() === lower);
      if (coder === undefined) throw new HttpError(403, "This email address has no access to this study", "email_not_allowed");
      session.coder = coder;
    } else if (link.params.coder !== undefined) {
      if (!values.includes(link.params.coder)) throw inactive();
      session.coder = link.params.coder;
    }
  }
  // Conditions: the link's value, or drawn
  const draws: SessionDraw[] = [];
  for (const condition of rules.item?.conditions ?? []) {
    const values = conditionValues(condition, rules.setsOf);
    if (condition.assign === "random") {
      draws.push({ name: condition.name, values, draw: condition.draw ?? "balanced" });
      continue;
    }
    const value = link.params[condition.name];
    if (value === undefined || !values.includes(value)) throw inactive();
    session[condition.name] = value;
  }
  return { participantId, session, draws };
}

/**
 * A preview session's values: like a link's, but never refused. Values come
 * from the preview page's URL parameters (link parameters too, by name),
 * else the default or first value.
 */
export function previewSessionValues(rules: SessionRules, urlParams: Record<string, string>): Record<string, string> {
  const session: Record<string, string> = {};
  const given = (key: string) => urlParams[key]?.trim().slice(0, MAX_SESSION_VALUE) || undefined;
  for (const p of rules.item?.params ?? []) {
    const first = "list" in p.values ? p.values.list[0]?.value : undefined;
    const value = given(p.kind === "url" ? sessionParamKey(p) : p.name) ?? (p.kind === "url" ? p.default : undefined) ?? first;
    if (value !== undefined) session[p.name] = value;
  }
  // The coder and the conditions: as given (by name), else the first value
  if (rules.item?.coders) {
    const coder = given("coder") ?? rules.setsOf(rules.item.coders.column)[0];
    if (coder !== undefined) session.coder = coder;
  }
  for (const condition of rules.item?.conditions ?? []) {
    const value = given(condition.name) ?? conditionValues(condition, rules.setsOf)[0];
    if (value !== undefined) session[condition.name] = value;
  }
  const participant = rules.item?.participant && urlParams[rules.item.participant.param]?.trim();
  if (participant) session.participant = participant.slice(0, MAX_SESSION_VALUE);
  return session;
}
