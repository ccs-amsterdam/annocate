import {
  MAX_SESSION_VALUE,
  inviteOf,
  loginRequired as designLoginRequired,
  urlParamKey,
  type SessionItem,
} from "@annotinder/contracts";
import { HttpError } from "../shared/http.js";

// A new session's `$session` values and participant id (docs/architecture.md
// §6-7): the URL parameters the design declares, `source`, and per the coder
// invitation the coder (by their link or their login's email) or a crowd's
// participant id (a URL parameter, or the login's email). Fixed when the
// session starts.

/** What the codebook asks of a new session, and the set columns' values. */
export interface SessionRules {
  item: SessionItem | null;
  /** A set column's values (its sets, without reserved ones). */
  setsOf: (group: string) => string[];
}

/** Specific coders who sign in: their units are their address's. */
export const emailCoders = (rules: SessionRules) => {
  const invite = inviteOf(rules.item);
  return invite.mode === "coders" && invite.link === "login";
};

/** Whether a new session needs a login (contracts `loginRequired`). */
export const loginRequired = (rules: SessionRules) => designLoginRequired(rules.item);

/** Whether a value fits a pattern (in full). */
const fits = (value: string, pattern?: string) => !pattern || new RegExp(`^(?:${pattern})$`).test(value);

/**
 * The participant id and `$session` values of a new session. A missing
 * required URL parameter or one with a value the design doesn't accept is
 * refused (400 `url_param_missing` / `url_param_invalid`), so such a link
 * doesn't start. Where sign-in is required only logins (401
 * `auth_required`), and with email coders only their addresses (403
 * `email_not_allowed`). A link's coder that is no longer one: 403
 * `link_inactive`. Specific coders' participant id is their coder value;
 * a crowd's is its URL parameter, or with a login the email.
 */
export function sessionValues(
  rules: SessionRules,
  link: { params: Record<string, string>; coder: string | null },
  urlParams: Record<string, string>,
  email: string | null,
): { coder: string | null; session: Record<string, string> } {
  const read = (key: string) => {
    const value = urlParams[key]?.trim();
    if (value && value.length > MAX_SESSION_VALUE)
      throw new HttpError(400, `The URL parameter "${key}" is too long`, "url_param_invalid");
    return value || undefined;
  };
  const invalid = (key: string) =>
    new HttpError(400, `The URL parameter "${key}" has a value this link doesn't accept`, "url_param_invalid");

  const session: Record<string, string> = {};
  for (const p of rules.item?.urlParams ?? []) {
    const key = urlParamKey(p);
    const value = read(key) ?? p.default;
    if (value === undefined)
      throw new HttpError(400, `This link needs the URL parameter "${key}"`, "url_param_missing");
    const ok = p.values ? p.values.some((v) => v.value === value) : fits(value, p.pattern);
    if (!ok) throw invalid(key);
    session[p.name] = value;
  }
  const source = read("source");
  if (source !== undefined) session.source = source;

  if (loginRequired(rules) && !email) throw new HttpError(401, "This study requires login", "auth_required");
  let id = link.coder;
  const invite = inviteOf(rules.item);
  if (invite.mode === "coders") {
    // The coder: the login's email, or the link's
    const values = rules.setsOf(invite.column);
    let coder: string | undefined;
    if (invite.link === "login") {
      const lower = email!.toLowerCase();
      coder = values.find((v) => v.toLowerCase() === lower);
      if (coder === undefined)
        throw new HttpError(403, "This email address has no access to this study", "email_not_allowed");
    } else if (link.params.coder !== undefined) {
      if (!values.includes(link.params.coder))
        throw new HttpError(403, "This link is no longer active", "link_inactive");
      coder = link.params.coder;
    }
    if (coder !== undefined) session.coder = coder;
  } else if (invite.participant) {
    const value = read(invite.participant.param);
    if (value === undefined)
      throw new HttpError(400, `This link needs the URL parameter "${invite.participant.param}"`, "url_param_missing");
    if (!fits(value, invite.participant.pattern)) throw invalid(invite.participant.param);
    id = value;
  } else if (invite.login && email) {
    id ??= email.toLowerCase();
  }
  return { coder: id, session };
}

/**
 * A preview session's values: like a link's, but never refused. Values come
 * from the preview page's URL parameters (the coder too, by name), else the
 * default or first value.
 */
export function previewSessionValues(rules: SessionRules, urlParams: Record<string, string>): Record<string, string> {
  const session: Record<string, string> = {};
  const given = (key: string) => urlParams[key]?.trim().slice(0, MAX_SESSION_VALUE) || undefined;
  for (const p of rules.item?.urlParams ?? []) {
    const value = given(urlParamKey(p)) ?? p.default ?? p.values?.[0]?.value;
    if (value !== undefined) session[p.name] = value;
  }
  const invite = inviteOf(rules.item);
  if (invite.mode === "coders") {
    const coder = given("coder") ?? rules.setsOf(invite.column)[0];
    if (coder !== undefined) session.coder = coder;
  } else if (invite.participant) {
    const participant = given(invite.participant.param);
    if (participant) session.participant = participant;
  }
  return session;
}
