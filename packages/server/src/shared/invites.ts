import { randomBytes } from "node:crypto";
import {
  CONFIRM_LINKS,
  MAX_LINKS,
  CodebookItemsSchema,
  linkCombinations,
  linkKey,
  sessionItem,
  setParameters,
  type CodebookItem,
  type CoderInviteResponse,
} from "@annotinder/contracts";
import { one, type Sql } from "../db.js";
import { groupSets } from "./sets.js";
import { HttpError } from "./http.js";

/** A row of `invites`: a link (docs/plans/sets-and-session-parameters.md §4). */
export interface InviteRow {
  id: number;
  job_id: number;
  label: string;
  auth: string;
  secret: string;
  emails: string[] | null;
  max_uses: number | null;
  uses: number;
  participant_id: string | null;
  params: Record<string, string>;
  link_key: string;
  created: Date;
  revoked_at: Date | null;
  retired_at: Date | null;
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
    ...(row.participant_id !== null ? { participantId: row.participant_id } : {}),
    created: row.created,
    revokedAt: row.revoked_at,
    params: row.params,
    retiredAt: row.retired_at,
  };
}

/** The links a codebook makes with the job's sets: one per combination of its link parameters' values. */
export async function linksOf(sql: Sql, jobId: number, items: CodebookItem[]): Promise<Record<string, string>[]> {
  const sets = new Map<string, string[]>();
  for (const group of new Set(setParameters(items).values())) sets.set(group, await groupSets(sql, jobId, group));
  return linkCombinations(sessionItem(items), (group) => sets.get(group) ?? []);
}

/**
 * Checks how many links publishing a codebook makes: at most `MAX_LINKS`
 * (400), and more than `CONFIRM_LINKS` only when confirmed (409
 * `confirm_links`). Returns the number.
 */
export async function checkLinkCount(sql: Sql, jobId: number, items: CodebookItem[], confirmed: boolean): Promise<number> {
  const n = (await linksOf(sql, jobId, items)).length;
  if (n > MAX_LINKS) throw new HttpError(400, `This codebook makes ${n} links; at most ${MAX_LINKS} are possible. List the combinations you need.`, "too_many_links");
  if (n > CONFIRM_LINKS && !confirmed) throw new HttpError(409, `This codebook makes ${n} links. Publish anyway?`, "confirm_links");
  return n;
}

/** A new link's label: its values, or "Open link" without. */
const linkLabel = (values: Record<string, string>) => Object.values(values).join(" · ") || "Open link";

/**
 * Makes the job's links match its published codebook (§4): a link per
 * combination of the link parameters' values. Missing links are made (with
 * `secrets` in order, else random ones); links the design no longer makes
 * are retired, never deleted (coders came from them); retired links that
 * are part of the design again come back. Without a deployment: nothing.
 * Returns the number of active links.
 */
export async function syncLinks(sql: Sql, jobId: number, options: { secrets?: string[] } = {}): Promise<number> {
  const deployed = await one<{ items: unknown }>(
    sql,
    "SELECT c.items FROM deployments d JOIN codebooks c ON c.id = d.codebook_id WHERE d.job_id = $1",
    [jobId],
  );
  const parsed = deployed ? CodebookItemsSchema.safeParse(deployed.items) : null;
  if (!parsed?.success) return 0;
  const wanted = await linksOf(sql, jobId, parsed.data);
  const rows = await sql.query<Pick<InviteRow, "id" | "link_key" | "retired_at">>(
    "SELECT id, link_key, retired_at FROM invites WHERE job_id = $1 ORDER BY id",
    [jobId],
  );
  const byKey = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!byKey.has(r.link_key)) byKey.set(r.link_key, r);
  const keep = new Set<number>();
  const secrets = [...(options.secrets ?? [])];
  for (const values of wanted) {
    const key = linkKey(values);
    const existing = byKey.get(key);
    if (existing) {
      keep.add(existing.id);
      continue;
    }
    const row = await one<{ id: number }>(
      sql,
      "INSERT INTO invites (job_id, label, auth, secret, params, link_key) VALUES ($1, $2, 'none', $3, $4, $5) RETURNING id",
      [jobId, linkLabel(values), secrets.shift() ?? randomBytes(16).toString("hex"), JSON.stringify(values), key],
    );
    byKey.set(key, { id: row!.id, link_key: key, retired_at: null });
    keep.add(row!.id);
  }
  const keepIds = [...keep];
  await sql.query("UPDATE invites SET retired_at = NULL WHERE job_id = $1 AND id = ANY($2) AND retired_at IS NOT NULL", [jobId, keepIds]);
  await sql.query("UPDATE invites SET retired_at = now() WHERE job_id = $1 AND NOT (id = ANY($2)) AND retired_at IS NULL", [jobId, keepIds]);
  return keep.size;
}

/** What the coder API needs to know about a link on every request (the session cookie, login), by secret. */
export interface LinkInfo {
  jobId: number;
  /** Whether the link takes logins: `auth` is not "none", or it lists email addresses. */
  login: "none" | "optional" | "required";
}

/** Known links, by secret, for a minute (read on every coder request). */
const links = new Map<string, { info: LinkInfo; until: number }>();

/** The invite of a link, as far as `LinkInfo` goes; null for an unknown secret. */
export async function linkInfo(sql: Sql, secret: string): Promise<LinkInfo | null> {
  let cached = links.get(secret);
  if (!cached || cached.until < Date.now()) {
    const row = await one<{ job_id: number; auth: string; emails: string[] | null }>(sql, "SELECT job_id, auth, emails FROM invites WHERE secret = $1", [
      secret,
    ]);
    if (!row) return null; // not cached: anyone can send any secret
    const login = row.auth === "required" || row.emails?.length ? "required" : row.auth === "optional" ? "optional" : "none";
    cached = { info: { jobId: row.job_id, login }, until: Date.now() + 60_000 };
    if (links.size > 10_000) links.clear();
    links.set(secret, cached);
  }
  return cached.info;
}

/** Forgets cached link info (after a link's access settings changed). */
export function forgetLink(secret: string): void {
  links.delete(secret);
}
