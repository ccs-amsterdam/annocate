import { urlParamName, type CoderInviteResponse, type ParticipantParam, type RequiredUrlParam } from "@annotinder/contracts";
import { HttpError } from "./http.js";
import { one, type Sql } from "../db.js";

/** A row of `invites`. */
export interface InviteRow {
  id: number;
  job_id: number;
  label: string;
  auth: string;
  secret: string;
  emails: string[] | null;
  max_uses: number | null;
  uses: number;
  variables: Record<string, string>;
  participant_id: string | null;
  participant_param: ParticipantParam | null;
  url_params: RequiredUrlParam[] | null;
  created: Date;
  revoked_at: Date | null;
  unitset_id: number | null;
}

export function toInviteResponse(row: InviteRow): CoderInviteResponse {
  return {
    id: row.id,
    jobId: row.job_id,
    label: row.label,
    auth: row.auth as CoderInviteResponse["auth"],
    secret: row.secret,
    uses: row.uses,
    ...(row.emails ? { emails: row.emails } : {}),
    ...(row.max_uses !== null ? { maxUses: row.max_uses } : {}),
    variables: row.variables,
    ...(row.participant_id !== null ? { participantId: row.participant_id } : {}),
    ...(row.participant_param ? { participantParam: row.participant_param } : {}),
    ...(row.url_params?.length ? { urlParams: row.url_params } : {}),
    created: row.created,
    revokedAt: row.revoked_at,
    unitsetId: row.unitset_id,
  };
}

/** The longest URL parameter value a link accepts (participant ids are short; it also bounds the pattern match). */
const MAX_PARAM_LENGTH = 256;

/** Whether a URL parameter's value fits a pattern (in full). */
const fits = (value: string, pattern?: string) =>
  value.length <= MAX_PARAM_LENGTH && (!pattern || new RegExp(`^(?:${pattern})$`).test(value));

/**
 * A new coder's participant id and `$session` values from their link's URL
 * parameters, as the invite requires them: a missing parameter or one that
 * doesn't fit its pattern is refused (400 `url_param_missing` /
 * `url_param_invalid`), so a link without them doesn't start.
 */
export function sessionFromUrl(invite: InviteRow, urlParams: Record<string, string>): { participantId: string | null; session: Record<string, string> } {
  const read = (param: string, pattern?: string) => {
    const value = urlParams[param]?.trim();
    if (!value) throw new HttpError(400, `This link needs the URL parameter "${param}"`, "url_param_missing");
    if (!fits(value, pattern)) throw new HttpError(400, `The URL parameter "${param}" has a value this link doesn't accept`, "url_param_invalid");
    return value;
  };
  const participantId = invite.participant_param ? read(invite.participant_param.param, invite.participant_param.pattern) : invite.participant_id;
  const session: Record<string, string> = {};
  for (const p of invite.url_params ?? []) session[urlParamName(p)] = read(p.param, p.pattern);
  return { participantId, session };
}

/** What the coder API needs to know about a link on every request (the session cookie, login), by secret. */
export interface LinkInfo {
  /** The URL parameter holding the participant id, if any. */
  participantParam: string | null;
  /** Whether the invite takes logins: `auth` is not "none", or it lists email addresses. */
  login: "none" | "optional" | "required";
}

/** Links, by secret, for a minute (read on every coder request). */
const links = new Map<string, { info: LinkInfo | null; until: number }>();

/** The invite of a link, as far as `LinkInfo` goes; null for an unknown secret. */
export async function linkInfo(sql: Sql, secret: string): Promise<LinkInfo | null> {
  let cached = links.get(secret);
  if (!cached || cached.until < Date.now()) {
    const row = await one<{ participant_param: ParticipantParam | null; auth: string; emails: string[] | null }>(
      sql,
      "SELECT participant_param, auth, emails FROM invites WHERE secret = $1",
      [secret],
    );
    const login = !row ? "none" : row.auth === "required" || row.emails?.length ? "required" : row.auth === "optional" ? "optional" : "none";
    cached = { info: row ? { participantParam: row.participant_param?.param ?? null, login } : null, until: Date.now() + 60_000 };
    if (links.size > 10_000) links.clear();
    links.set(secret, cached);
  }
  return cached.info;
}

/** The participant id a link carries, if its invite takes one from a URL parameter. */
export function participantFromLink(link: LinkInfo | null, urlParams: Record<string, string>): string | undefined {
  return link?.participantParam ? urlParams[link.participantParam]?.trim() || undefined : undefined;
}
