import {
  CODER_SET,
  TEST_SET,
  duplicateCoders,
  listedCoders,
  unknownCoders,
  type CoderKind,
  type CoderResponse,
  type CodersCreate,
  type UnassignedUnits,
} from "@annotinder/contracts";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { row, rows, type Db } from "../db/index.js";
import { advisoryLock } from "../db/locks.js";
import { anyOf } from "../db/sql.js";
import { coders, deployments } from "../db/schema/index.js";
import { HttpError } from "./http.js";

// The study's coders (`coders`, docs/coder-identity.md §2): expert coders are
// made by the researchers, here; a crowd's coders when a session with a new
// coder id starts (`crowdCoder`). A coder id never changes, and ids that
// differ only in case are one coder.

/** A row of `coders`. */
export type StudyCoder = typeof coders.$inferSelect;

const lower = (text: string) => text.toLowerCase();

/** The study's coder with this id, ignoring case. */
export async function findCoder(db: Db, studyId: number, coder: string): Promise<StudyCoder | undefined> {
  const [found] = await db
    .select()
    .from(coders)
    .where(and(eq(coders.studyId, studyId), sql`lower(${coders.coder}) = ${lower(coder)}`));
  return found;
}

/** The study's expert coders, with their email addresses. */
export function expertCoders(db: Db, studyId: number): Promise<{ coder: string; email: string | null }[]> {
  return db
    .select({ coder: coders.coder, email: coders.email })
    .from(coders)
    .where(and(eq(coders.studyId, studyId), eq(coders.kind, "expert")))
    .orderBy(asc(coders.id));
}

/** One at a time per study: creating coders and giving them addresses check what is there, then write. */
const lockCoders = (db: Db, studyId: number) => advisoryLock(db, `coders:${studyId}`);

/**
 * Creates expert coders. Refused as a whole when an id or an email address
 * is given twice or is another coder's already (ignoring case): 409, naming
 * them. Returns the new coders' rows' ids.
 */
export async function createCoders(db: Db, studyId: number, body: CodersCreate): Promise<number[]> {
  await lockCoders(db, studyId);
  const existing = await db
    .select({ coder: coders.coder, email: coders.email })
    .from(coders)
    .where(eq(coders.studyId, studyId));
  const ids = body.coders.map((c) => c.coder);
  const emails = body.coders.flatMap((c) => (c.email ? [c.email] : []));
  refuseDuplicates("given twice", duplicateCoders(ids));
  refuseDuplicates(
    "already coders of this study",
    duplicateCoders(
      ids,
      existing.map((c) => c.coder),
    ),
  );
  refuseDuplicates("email addresses given twice", duplicateCoders(emails));
  refuseDuplicates(
    "email addresses of other coders already",
    duplicateCoders(
      emails,
      existing.flatMap((c) => (c.email ? [c.email] : [])),
    ),
  );
  const created = await db
    .insert(coders)
    .values(
      body.coders.map((c) => ({
        studyId,
        coder: c.coder,
        kind: "expert" as const,
        email: c.email ? lower(c.email) : null,
      })),
    )
    .returning({ id: coders.id });
  return created.map((c) => c.id);
}

function refuseDuplicates(what: string, found: string[]): void {
  if (found.length > 0) throw new HttpError(409, `${capitalised(what)}: ${listedCoders(found)}`, "coder_exists");
}

const capitalised = (text: string) => text[0]!.toUpperCase() + text.slice(1);

/**
 * Sets or clears an expert coder's email address (what they sign in with
 * from now on; sessions keep the address they signed in with). 404 for an
 * unknown coder, 400 for a crowd's coder, 409 for another coder's address.
 * Returns the coder's row's id.
 */
export async function setCoderEmail(db: Db, studyId: number, coder: string, email: string | null): Promise<number> {
  await lockCoders(db, studyId);
  const found = await findCoder(db, studyId, coder);
  if (!found || found.coder !== coder) throw new HttpError(404, `No coder '${coder}' in this study`);
  if (found.kind !== "expert")
    throw new HttpError(400, "Only expert coders have an email address: a crowd's coders sign in for themselves");
  if (email !== null) {
    const taken = await db.$count(
      coders,
      and(eq(coders.studyId, studyId), sql`lower(${coders.email}) = ${lower(email)}`, sql`${coders.id} <> ${found.id}`),
    );
    if (taken > 0) throw new HttpError(409, `${email} is another coder's email address`, "coder_exists");
  }
  await db
    .update(coders)
    .set({ email: email === null ? null : lower(email) })
    .where(eq(coders.id, found.id));
  return found.id;
}

/** Refuses names of the units' `coder_set` that aren't expert coders of the study (400, naming them). */
export async function checkCoderSet(db: Db, studyId: number, names: string[]): Promise<void> {
  const experts = (await expertCoders(db, studyId)).map((c) => c.coder);
  const unknown = unknownCoders(names, experts);
  if (unknown.length === 0) return;
  throw new HttpError(
    400,
    `${CODER_SET} names ${unknown.length === 1 ? "a coder who isn't" : "coders who aren't"} an expert coder of this study: ${listedCoders(unknown)}. Add them first (Coders, Add coders), with the same spelling.`,
    "unknown_coders",
  );
}

/** The expert coder who signs in with this address, if any. */
export async function coderOfEmail(db: Db, studyId: number, email: string): Promise<string | null> {
  const [found] = await db
    .select({ coder: coders.coder })
    .from(coders)
    .where(and(eq(coders.studyId, studyId), eq(coders.kind, "expert"), sql`lower(${coders.email}) = ${lower(email)}`));
  return found?.coder ?? null;
}

/**
 * A crowd's coder for a session about to start: the coder with this id
 * (ignoring case; the id as it was first written), made if new. An id that
 * is one of the study's expert coders is refused (409 `coder_is_expert`):
 * possible only when a study had expert coders before.
 */
export async function crowdCoder(db: Db, studyId: number, coder: string): Promise<string> {
  const found = await findCoder(db, studyId, coder);
  if (found?.kind === "expert")
    throw new HttpError(
      409,
      "This coder id belongs to one of the study's expert coders: it can't start a session on this link",
      "coder_is_expert",
    );
  if (found) return found.coder;
  await db.insert(coders).values({ studyId, coder, kind: "crowd" });
  return coder;
}

/** What the list's query gives per coder; counts are missing where there is nothing to count. */
interface CoderListRow {
  id: number;
  coder: string;
  kind: CoderKind;
  email: string | null;
  created: Date;
  live: number | null;
  draft: number | null;
  differs: boolean | null;
  done: number | null;
  remaining: number | null;
  sessions: number | null;
  lastActive: Date | null;
}

/**
 * The study's coders in the order they were made, with their units
 * (contracts `CoderResponse`): one `kind`, or the coders with these row ids.
 */
export async function listCoders(
  db: Db,
  studyId: number,
  only: { kind?: CoderKind; ids?: number[] } = {},
): Promise<CoderResponse[]> {
  const members = (live: boolean) => sql`
    SELECT s.name AS coder, m.unit_id FROM unit_sets s JOIN unit_set_members m ON m.set_id = s.id
    WHERE s.study_id = ${studyId} AND s.live = ${live} AND s.grp = ${CODER_SET}`;
  const found = await rows<CoderListRow>(
    db,
    sql`
    WITH live AS (${members(true)}), draft AS (${members(false)}),
    coded AS (
      SELECT DISTINCT s.coder, a.unit_id FROM annotation_values a JOIN coder_sessions s ON s.id = a.session_id
      WHERE a.study_id = ${studyId} AND a.unit_id IS NOT NULL AND a.retired_at IS NULL AND s.coder IS NOT NULL
    ),
    assigned AS (
      SELECT coalesce(l.coder, d.coder) AS coder, count(l.unit_id)::int AS live, count(d.unit_id)::int AS draft,
        bool_or(l.unit_id IS NULL OR d.unit_id IS NULL) AS differs
      FROM live l FULL JOIN draft d ON d.coder = l.coder AND d.unit_id = l.unit_id
      GROUP BY 1
    ),
    remaining AS (
      SELECT l.coder, count(*)::int AS n FROM live l
      LEFT JOIN coded k ON k.coder = l.coder AND k.unit_id = l.unit_id
      WHERE k.unit_id IS NULL GROUP BY l.coder
    ),
    done AS (SELECT coder, count(*)::int AS n FROM coded GROUP BY coder),
    started AS (
      SELECT coder, count(*)::int AS n FROM coder_sessions
      WHERE study_id = ${studyId} AND coder IS NOT NULL GROUP BY coder
    ),
    active AS (
      SELECT s.coder, max(a.updated) AS at FROM annotation_values a JOIN coder_sessions s ON s.id = a.session_id
      WHERE a.study_id = ${studyId} AND a.retired_at IS NULL AND NOT a.assigned AND s.coder IS NOT NULL
      GROUP BY s.coder
    )
    SELECT c.id, c.coder, c.kind, c.email, c.created, a.live, a.draft, a.differs, d.n AS done,
      r.n AS remaining, s.n AS sessions, v.at AS "lastActive"
    FROM coders c
    LEFT JOIN assigned a ON a.coder = c.coder
    LEFT JOIN remaining r ON r.coder = c.coder
    LEFT JOIN done d ON d.coder = c.coder
    LEFT JOIN started s ON s.coder = c.coder
    LEFT JOIN active v ON v.coder = c.coder
    WHERE c.study_id = ${studyId}
      ${only.kind ? sql`AND c.kind = ${only.kind}` : sql``}
      ${only.ids ? sql`AND ${anyOf(sql`c.id`, only.ids)}` : sql``}
    ORDER BY c.id`,
  );
  return found.map(toCoderResponse);
}

/** A coder of the list: only expert coders have units of their own. */
function toCoderResponse(c: CoderListRow): CoderResponse {
  const expert = c.kind === "expert";
  return {
    id: Number(c.id),
    coder: c.coder,
    kind: c.kind,
    email: c.email,
    created: new Date(c.created),
    assigned: expert ? (c.live ?? 0) : null,
    assignedDraft: expert ? (c.draft ?? 0) : null,
    draftDiffers: expert && (c.differs ?? false),
    done: c.done ?? 0,
    remaining: expert ? (c.remaining ?? 0) : null,
    sessions: c.sessions ?? 0,
    lastActive: c.lastActive ? new Date(c.lastActive) : null,
  };
}

/**
 * The units no expert coder has (contracts `UnassignedUnits`): units that
 * are in no set of `coder_set` and aren't test units, among the deployed
 * units with the deployed sets (null before the first deploy), and among the
 * draft's with the draft's.
 */
export async function unassignedUnits(db: Db, studyId: number): Promise<UnassignedUnits> {
  const placed = (live: boolean, unit: string) => sql`
    EXISTS (SELECT 1 FROM unit_set_members m JOIN unit_sets s ON s.id = m.set_id
      WHERE m.unit_id = ${sql.raw(unit)} AND s.live = ${live} AND s.grp IN (${CODER_SET}, ${TEST_SET}))`;
  const counted = await row<{ live: number; draft: number }>(
    db,
    sql`SELECT
      (SELECT count(DISTINCT v.unit_id)::int FROM unit_versions v
        WHERE v.study_id = ${studyId} AND v.to_deploy IS NULL AND NOT ${placed(true, "v.unit_id")}) AS live,
      (SELECT count(*)::int FROM units u
        WHERE u.study_id = ${studyId} AND u.in_draft AND NOT ${placed(false, "u.id")}) AS draft`,
  );
  const deployed = (await db.$count(deployments, eq(deployments.studyId, studyId))) > 0;
  return { live: deployed ? counted!.live : null, draft: counted!.draft };
}

/** The study's coders with these ids, as they are written (for removing them). */
export function codersById(db: Db, studyId: number, ids: string[]): Promise<StudyCoder[]> {
  return db
    .select()
    .from(coders)
    .where(and(eq(coders.studyId, studyId), inArray(coders.coder, ids)));
}
