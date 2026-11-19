import { randomBytes } from "node:crypto";
import {
  CONFIRM_LINKS,
  MAX_LINKS,
  DesignItemsSchema,
  linkCombinations,
  linkKey,
  sessionItem,
  type DesignItem,
  type LinkResponse,
} from "@annotinder/contracts";
import { and, asc, eq, inArray, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { deployments, designVersions, links as linksTable, studies } from "../db/schema/index.js";
import { groupSets } from "./sets.js";
import { designVersionItems } from "./designVersions.js";
import { HttpError } from "./http.js";

/** A row of `links`: a link (docs/plans/sets-and-session-parameters.md §4). */
export type LinkRow = typeof linksTable.$inferSelect;

export function toLinkResponse(row: LinkRow): LinkResponse {
  return {
    id: row.id,
    studyId: row.studyId,
    label: row.label,
    secret: row.secret,
    uses: row.uses,
    ...(row.maxUses !== null ? { maxUses: row.maxUses } : {}),
    ...(row.participantId !== null ? { participantId: row.participantId } : {}),
    created: row.created,
    revokedAt: row.revokedAt,
    params: row.params,
    retiredAt: row.retiredAt,
  };
}

/**
 * The links a codebook makes with the deployed set columns (`live`) or the
 * draft's: one per coder (unless they sign in), per value of a condition
 * assigned by link, and per combination of its link parameters' values.
 */
export async function linksOf(db: Db, studyId: number, items: DesignItem[], live: boolean): Promise<Record<string, string>[]> {
  const session = sessionItem(items);
  const columns = [session?.coders?.column, ...(session?.conditions ?? []).map((c) => c.units)].filter((c): c is string => !!c);
  const sets = new Map<string, string[]>();
  for (const column of new Set(columns)) sets.set(column, await groupSets(db, studyId, column, live));
  return linkCombinations(session, (group) => sets.get(group) ?? []);
}

/**
 * Checks how many links deploying a codebook makes: at most `MAX_LINKS`
 * (400), and more than `CONFIRM_LINKS` only when confirmed (409
 * `confirm_links`). Returns the number.
 */
export async function checkLinkCount(db: Db, studyId: number, items: DesignItem[], confirmed: boolean, live: boolean): Promise<number> {
  const n = (await linksOf(db, studyId, items, live)).length;
  if (n > MAX_LINKS) throw new HttpError(400, `This design makes ${n} links; at most ${MAX_LINKS} are possible. List the combinations you need.`, "too_many_links");
  if (n > CONFIRM_LINKS && !confirmed) throw new HttpError(409, `This design makes ${n} links. Deploy anyway?`, "confirm_links");
  return n;
}

/** A new link's label: its values, or "Open link" without. */
const linkLabel = (values: Record<string, string>) => Object.values(values).join(" · ") || "Open link";

/**
 * Makes the study's links match its deployed codebook (§4): a link per
 * combination of the link parameters' values. Missing links are made (with
 * `secrets` in order, else random ones); links the design no longer makes
 * are retired, never deleted (coders came from them); retired links that
 * are part of the design again come back. Without a deployment: nothing.
 * Returns the number of active links.
 */
export async function syncLinks(db: Db, studyId: number, options: { secrets?: string[] } = {}): Promise<number> {
  const [deployed] = await db
    .select({ items: designVersions.items, session: designVersions.session })
    .from(deployments)
    .innerJoin(designVersions, eq(designVersions.id, deployments.designVersionId))
    .where(eq(deployments.studyId, studyId));
  const parsed = deployed ? DesignItemsSchema.safeParse(designVersionItems(deployed)) : null;
  if (!parsed?.success) return 0;
  const wanted = await linksOf(db, studyId, parsed.data, true);
  const rows = await db
    .select({ id: linksTable.id, linkKey: linksTable.linkKey })
    .from(linksTable)
    .where(eq(linksTable.studyId, studyId))
    .orderBy(asc(linksTable.id));
  const byKey = new Map<string, number>();
  for (const r of rows) if (!byKey.has(r.linkKey)) byKey.set(r.linkKey, r.id);
  const keep = new Set<number>();
  const secrets = [...(options.secrets ?? [])];
  for (const values of wanted) {
    const key = linkKey(values);
    const existing = byKey.get(key);
    if (existing !== undefined) {
      keep.add(existing);
      continue;
    }
    const [made] = await db
      .insert(linksTable)
      .values({ studyId, label: linkLabel(values), secret: secrets.shift() ?? randomBytes(16).toString("hex"), params: values, linkKey: key })
      .returning({ id: linksTable.id });
    byKey.set(key, made!.id);
    keep.add(made!.id);
  }
  const keepIds = [...keep];
  const studyLinks = eq(linksTable.studyId, studyId);
  await db
    .update(linksTable)
    .set({ retiredAt: null })
    .where(and(studyLinks, inArray(linksTable.id, keepIds), isNotNull(linksTable.retiredAt)));
  await db
    .update(linksTable)
    .set({ retiredAt: sql`now()` })
    .where(and(studyLinks, notInArray(linksTable.id, keepIds), isNull(linksTable.retiredAt)));
  return keep.size;
}

/** What the coder API needs to know about a link on every request (the session cookie, login), by secret. */
export interface LinkInfo {
  studyId: number;
  /** Whether its study takes sign-ins (the study's `signIn`). */
  login: "none" | "optional" | "required";
}

/** Known links, by secret, for a minute (read on every coder request). */
const links = new Map<string, { info: LinkInfo; until: number }>();

/** The link of a link, as far as `LinkInfo` goes; null for an unknown secret. */
export async function linkInfo(db: Db, secret: string): Promise<LinkInfo | null> {
  let cached = links.get(secret);
  if (!cached || cached.until < Date.now()) {
    const [row] = await db
      .select({ studyId: linksTable.studyId, signIn: studies.signIn })
      .from(linksTable)
      .innerJoin(studies, eq(studies.id, linksTable.studyId))
      .where(eq(linksTable.secret, secret));
    if (!row) return null; // not cached: anyone can send any secret
    const login = row.signIn === "off" ? "none" : row.signIn;
    cached = { info: { studyId: row.studyId, login }, until: Date.now() + 60_000 };
    if (links.size > 10_000) links.clear();
    links.set(secret, cached);
  }
  return cached.info;
}

/** Forgets cached link info (after a link's access settings changed). */
export function forgetLink(secret: string): void {
  links.delete(secret);
}

/** Forgets the cached info of a study's links (after its sign-in setting changed). */
export function forgetStudyLinks(studyId: number): void {
  for (const [secret, { info }] of links) if (info.studyId === studyId) links.delete(secret);
}
