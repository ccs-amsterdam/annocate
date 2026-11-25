import {
  MAX_SESSION_VALUE,
  inviteOf,
  loginRequired,
  matchesUrlPattern,
  urlParamKey,
  own,
  type Invite,
  type SessionItem,
} from "@annotinder/contracts";
import { HttpError } from "../shared/http.js";

/**
 * Who codes, as the runtime runs it: a deployed design always chose
 * (contracts `deployErrors`); a preview of a design that hasn't yet runs
 * as a crowd (one link).
 */
export const runtimeInvite = (item: SessionItem | null | undefined): Invite => inviteOf(item) ?? { mode: "crowd" };

// A new session's `$session` values (docs/architecture.md §6-7): the URL
// parameters the design declares, `source`, and who the coder is (`coder`):
// per the coder unit assignment, their value in the units' `coder_set` (by
// their link, the name they picked, or the expert coder whose email address
// their login has), or a crowd's id from a URL parameter (or the login's
// email). Fixed when the session starts.

/** What the design asks of a new session, and the coders (`coder_set`'s values). */
export interface SessionRules {
  item: SessionItem | null;
  coders: readonly string[];
}

/** A login as a new session reads it: its verified address, and the expert coder who signs in with it (`coderOfEmail`), if any. */
export interface SessionLogin {
  email: string;
  coder?: string | null;
}

/** Expert coders who sign in: their units are those of the coder with their address. */
export const emailCoders = (rules: SessionRules) => {
  const invite = runtimeInvite(rules.item);
  return invite.mode === "coders" && invite.link === "login";
};

/** Whether a value fits a pattern (in full). */
const fits = (value: string, pattern?: string) => !pattern || matchesUrlPattern(value, pattern);

/**
 * The coder and `$session` values of a new session. A missing
 * required URL parameter or one with a value the design doesn't accept is
 * refused (400 `url_param_missing` / `url_param_invalid`), so such a link
 * doesn't start. Where sign-in is required only logins (401
 * `auth_required`), and where expert coders sign in only the address of a
 * coder with units (403 `email_not_allowed`). A link's coder that is no longer one: 403
 * `link_inactive`. The coder (also `$session.coder`): expert coders' value
 * in `coder_set`; a crowd's URL parameter, or with a required login the email.
 */
export function sessionValues(
  rules: SessionRules,
  params: Record<string, string>,
  urlParams: Record<string, string>,
  login: SessionLogin | null,
): { coder: string | null; session: Record<string, string> } {
  const email = login?.email ?? null;
  const read = (key: string) => {
    const value = own(urlParams, key)?.trim();
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

  if (loginRequired(rules.item) && !email) throw new HttpError(401, "This study requires login", "auth_required");
  // Who the coder is ($session.coder): per the invitation
  let coderId: string | null = null;
  const invite = runtimeInvite(rules.item);
  if (invite.mode === "coders") {
    // The coder: the one who signs in with the login's address, or the link's
    const values = rules.coders;
    let coder: string | undefined;
    if (invite.link === "login") {
      coder = values.find((v) => v === login?.coder);
      if (coder === undefined)
        throw new HttpError(403, "This email address has no access to this study", "email_not_allowed");
    } else if (params.coder !== undefined) {
      if (!values.includes(params.coder)) throw new HttpError(403, "This link is no longer active", "link_inactive");
      coder = params.coder;
    }
    if (coder !== undefined) coderId = coder;
  } else {
    // A crowd: the coder's id from a URL parameter, else the login's email (where sign-in is required)
    const param = invite.coderParam;
    const value = param ? read(param.param) : undefined;
    if (param && value === undefined && !param.optional)
      throw new HttpError(400, `This link needs the URL parameter "${param.param}"`, "url_param_missing");
    if (param && value !== undefined) {
      if (!fits(value, param.pattern)) throw invalid(param.param);
      coderId = value;
    } else if (invite.login && email) coderId = email.toLowerCase();
  }
  if (coderId) session.coder = coderId;
  return { coder: coderId, session };
}

/**
 * A preview session's values: like a link's, but never refused. Values come
 * from the preview page's URL parameters (the coder too, by name), else the
 * default or first value.
 */
export function previewSessionValues(rules: SessionRules, urlParams: Record<string, string>): Record<string, string> {
  const session: Record<string, string> = {};
  const given = (key: string) => own(urlParams, key)?.trim().slice(0, MAX_SESSION_VALUE) || undefined;
  for (const p of rules.item?.urlParams ?? []) {
    const value = given(urlParamKey(p)) ?? p.default ?? p.values?.[0]?.value;
    if (value !== undefined) session[p.name] = value;
  }
  const invite = runtimeInvite(rules.item);
  if (invite.mode === "coders") {
    const coder = given("coder") ?? rules.coders[0];
    if (coder !== undefined) session.coder = coder;
  } else {
    const coder = invite.coderParam ? given(invite.coderParam.param) : undefined;
    if (coder) session.coder = coder;
  }
  return session;
}
