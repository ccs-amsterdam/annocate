import type { DeviceDetails } from "../shared/devices.js";
import { inviteOf, linkMaxCoders, type CodersInvite } from "@annotinder/contracts";
import { and, asc, eq, gt, lt, sql } from "drizzle-orm";
import { type Db } from "../db/index.js";
import { annotationValues, sessionDevices, coderSessions, links } from "../db/schema/index.js";
import { type CoderRow } from "../shared/coders.js";
import { HttpError } from "../shared/http.js";
import { emailCoders, sessionValues, type SessionLogin } from "./sessionValues.js";
import { coderOfEmail, crowdCoder, forgetCrowdCoders } from "../shared/studyCoders.js";
import { nothingHere } from "./session.js";
import { checkNewCoder } from "../shared/limits.js";
import type { ResolveCoderRequest } from "./types.js";
import { advisoryLock } from "../db/locks.js";

// Starting a coder's session (docs/coder-identity.md §4-5): the session a
// device has, or a new one from its link.

/**
 * The most sessions one coder id has in a study. A new session of a known
 * coder (`x-new-session`) doesn't use up the link, so without this one
 * participant could fill a study with sessions.
 */
export const MAX_SESSIONS_PER_CODER = 5;

/** A device's session: the coder and the device row. */
export interface KnownCoder {
  coder: CoderRow;
  deviceId: number;
}

/** The session a device key has in this study, if any. */
export async function knownCoder(db: Db, studyId: number, coderKey: string): Promise<KnownCoder | null> {
  const [known] = await db
    .select({ coder: coderSessions, deviceId: sessionDevices.id })
    .from(sessionDevices)
    .innerJoin(coderSessions, eq(coderSessions.id, sessionDevices.sessionId))
    .where(eq(sessionDevices.keyHash, coderKey));
  if (known && known.coder.studyId !== studyId)
    throw new HttpError(403, "This session belongs to another study", "coder_key_invalid");
  return known ?? null;
}

/** Adds a device's key to a session (or moves it there from another one); returns the device row. */
export async function addDevice(
  db: Db,
  studyId: number,
  sessionId: number,
  coderKey: string,
  device: DeviceDetails = { type: null, browser: null, os: null },
): Promise<number> {
  const [added] = await db
    .insert(sessionDevices)
    .values({ studyId, sessionId, keyHash: coderKey, deviceType: device.type, browser: device.browser, os: device.os })
    .onConflictDoUpdate({ target: sessionDevices.keyHash, set: { sessionId: sql`excluded.session_id` } })
    .returning({ id: sessionDevices.id });
  return added!.id;
}

/** The latest session in this study linked to an email (one per email: docs/coder-identity.md §5). */
export async function sessionOfEmail(db: Db, studyId: number, email: string): Promise<CoderRow | undefined> {
  const [found] = await db
    .select()
    .from(coderSessions)
    .where(and(eq(coderSessions.studyId, studyId), sql`lower(${coderSessions.email}) = lower(${email})`))
    .orderBy(sql`${coderSessions.id} DESC`)
    .limit(1);
  return found;
}

type Started = { row: CoderRow; deviceId: number };

/**
 * A device's session to link to a login (`known`, without an email yet), or
 * a new device's: found by the login, or created from the link.
 */
export async function findOrCreateCoder(
  db: Db,
  studyId: number,
  request: ResolveCoderRequest,
  known: KnownCoder | null,
  login: { email: string } | null,
): Promise<Started> {
  const { coderKey, device } = request;
  if (known && login) return linkLogin(db, studyId, request, known, login);
  const signedIn = login ? await sessionLogin(db, studyId, request, login) : null;
  const mine = signedIn ? await sessionOfLogin(db, studyId, request, signedIn) : undefined;
  if (mine) return { row: mine, deviceId: await addDevice(db, studyId, mine.id, coderKey, device) };
  const link = await openLink(db, studyId, request);
  const invite = inviteOf(request.sessionRules?.item);
  let params = link.params;
  if (invite.mode === "coders" && invite.link === "pick_name") {
    const picked = await pickName(db, studyId, request, invite);
    if ("taken" in picked)
      return { row: picked.taken, deviceId: await addDevice(db, studyId, picked.taken.id, coderKey, device) };
    params = { ...params, coder: picked.name };
  }
  // A coder id is a label, never a credential: a new device for a
  // known coder gets a *new* session, and only when asked for.
  const values = sessionValues(
    request.sessionRules ?? { item: null, coders: [] },
    params,
    request.urlParams ?? {},
    signedIn,
  );
  const coder = values.coder === null ? null : await studyCoder(db, studyId, invite.mode, values.coder);
  const session = coder === null ? values.session : { ...values.session, coder };
  const coderHasSession = coder !== null && (await coderHasSessions(db, studyId, request, coder));
  if (request.paused) throw new HttpError(409, "This study is paused", "study_paused");
  await checkNewCoder(db, studyId);
  // A new session of a known coder is the same person: it doesn't use up the link.
  if (!coderHasSession) await countLinkUse(db, link.id, request);
  const [created] = await db
    .insert(coderSessions)
    .values({ studyId, email: login?.email.toLowerCase() ?? null, coder, linkId: link.id, session })
    .returning();
  // A new session on a device that had one (`newSession`): the device moves to the new one.
  return { row: created!, deviceId: await addDevice(db, studyId, created!.id, coderKey, device) };
}

/** A login for a new session: where expert coders sign in, with the coder whose email address it has. */
async function sessionLogin(
  db: Db,
  studyId: number,
  request: ResolveCoderRequest,
  login: { email: string },
): Promise<SessionLogin> {
  const signIn = request.sessionRules && emailCoders(request.sessionRules);
  return { email: login.email, coder: signIn ? await coderOfEmail(db, studyId, login.email) : null };
}

/**
 * The study's coder a new session is of (`coders`, the session's `coder`).
 * Expert coders exist (the researchers made them). A crowd's id is made a
 * coder the first time it starts a session, one request at a time per id;
 * an id that only differs in case from a coder's is that coder.
 */
async function studyCoder(db: Db, studyId: number, mode: "coders" | "crowd", coder: string): Promise<string> {
  if (mode === "coders") return coder;
  await lockCoder(db, studyId, coder);
  return crowdCoder(db, studyId, coder);
}

/** One request at a time per coder id (whatever its case), until the transaction ends. */
const lockCoder = (db: Db, studyId: number, coder: string) =>
  advisoryLock(db, `coder:${studyId}:${coder.toLowerCase()}`);

/** The latest session of a coder in this study. */
async function sessionOfCoder(db: Db, studyId: number, coder: string): Promise<CoderRow | undefined> {
  const [found] = await db
    .select()
    .from(coderSessions)
    .where(and(eq(coderSessions.studyId, studyId), eq(coderSessions.coder, coder)))
    .orderBy(sql`${coderSessions.id} DESC`)
    .limit(1);
  return found;
}

/**
 * A login links its email to the device's session, once. If the email already
 * has a session in this study, this device continues that one instead.
 */
async function linkLogin(
  db: Db,
  studyId: number,
  request: ResolveCoderRequest,
  known: KnownCoder,
  login: { email: string },
): Promise<Started> {
  const other = await sessionOfEmail(db, studyId, login.email);
  if (other) {
    const deviceId = await addDevice(db, studyId, other.id, request.coderKey, request.device);
    await removeIfUnused(db, studyId, known.coder);
    return { row: other, deviceId };
  }
  const [linked] = await db
    .update(coderSessions)
    .set({ email: login.email.toLowerCase() })
    .where(eq(coderSessions.id, known.coder.id))
    .returning();
  return { row: linked!, deviceId: known.deviceId };
}

/**
 * Removes a session its device just left for its email's session, if nobody
 * can get back to it (no device, no email) and the coder answered nothing in
 * it: the session a second device starts before the coder logs in. A session
 * with answers stays, for the researcher. A crowd's coder whose only session
 * it was goes with it.
 */
async function removeIfUnused(db: Db, studyId: number, left: CoderRow): Promise<void> {
  const a = annotationValues;
  const devices = await db.$count(sessionDevices, eq(sessionDevices.sessionId, left.id));
  const answers = await db.$count(a, and(eq(a.studyId, studyId), eq(a.sessionId, left.id), eq(a.assigned, false)));
  if (devices > 0 || answers > 0 || left.ended !== null) return;
  await db.delete(coderSessions).where(eq(coderSessions.id, left.id));
  await returnLinkUse(db, studyId, left);
  if (left.coder !== null) await forgetCrowdCoders(db, studyId, [left.coder]);
}

/** Gives a removed session's place on its link back, unless it didn't take one (a known coder's further session). */
async function returnLinkUse(db: Db, studyId: number, removed: CoderRow): Promise<void> {
  const { linkId, coder } = removed;
  const others = and(eq(coderSessions.studyId, studyId), eq(coderSessions.coder, coder ?? ""));
  const knownCoder = coder !== null && (await db.$count(coderSessions, others)) > 0;
  if (linkId === null || knownCoder) return;
  await db
    .update(links)
    .set({ uses: sql`${links.uses} - 1` })
    .where(and(eq(links.id, linkId), gt(links.uses, 0)));
}

/**
 * The session a login has in this study, for a new device of it. Expert
 * coders who sign in have one session each, their coder's: found by the
 * coder whose email address the login has now (the session keeps the address
 * it was started with), also when a new session is asked for. Anyone else:
 * the session linked to the login's address, unless a new one is asked for.
 */
async function sessionOfLogin(
  db: Db,
  studyId: number,
  request: ResolveCoderRequest,
  login: SessionLogin,
): Promise<CoderRow | undefined> {
  if (login.coder) return sessionOfCoder(db, studyId, login.coder);
  const oneEach = request.sessionRules && emailCoders(request.sessionRules);
  return !request.newSession && !oneEach ? sessionOfEmail(db, studyId, login.email) : undefined;
}

/**
 * The request's link, if it starts sessions. Link problems: 404 (no such
 * link) or 403 (no new sessions), never 401, which only means "log in"
 * (`auth_required`).
 */
async function openLink(db: Db, studyId: number, request: ResolveCoderRequest) {
  if (!request.linkSecret) throw nothingHere();
  const [link] = await db.select().from(links).where(eq(links.secret, request.linkSecret));
  if (!link || link.studyId !== studyId) throw nothingHere();
  // Revoked or retired: no new sessions, also not for a known coder (existing sessions go on).
  if (link.revokedAt !== null) throw new HttpError(403, "This link has been revoked", "link_revoked");
  if (link.retiredAt !== null) throw new HttpError(403, "This link is no longer active", "link_inactive");
  return link;
}

/**
 * Whether the coder id has sessions in the study already: then a new one
 * needs asking for (409 `coder_has_session`), and there is a most (403
 * `coder_session_limit`).
 */
async function coderHasSessions(
  db: Db,
  studyId: number,
  request: ResolveCoderRequest,
  coder: string,
): Promise<boolean> {
  // One at a time per coder id, so parallel requests can't pass the most sessions together
  await lockCoder(db, studyId, coder);
  const count = await db.$count(coderSessions, and(eq(coderSessions.studyId, studyId), eq(coderSessions.coder, coder)));
  if (count > 0 && !request.newSession) {
    throw new HttpError(409, "This coder already has a session on another device", "coder_has_session");
  }
  if (count >= MAX_SESSIONS_PER_CODER) {
    throw new HttpError(403, "This coder has started too many sessions", "coder_session_limit");
  }
  return count > 0;
}

/**
 * Counts a new coder on the link. Checked and counted in one statement, so
 * concurrent coders can't overrun a crowd's most coders (per link,
 * docs/architecture.md §5).
 */
async function countLinkUse(db: Db, linkId: number, request: ResolveCoderRequest): Promise<void> {
  const maxCoders = linkMaxCoders(request.sessionRules?.item);
  const used = await db
    .update(links)
    .set({ uses: sql`${links.uses} + 1` })
    .where(and(eq(links.id, linkId), maxCoders === undefined ? undefined : lt(links.uses, maxCoders)))
    .returning({ id: links.id });
  if (used.length === 0) throw new HttpError(403, "This link has been used up", "link_used_up");
}

/**
 * On a link where coders pick their name (docs/architecture.md §6.1): the
 * picked name, which becomes the link's coder. Taken by another device's
 * session: refused, or (`nameDevices: any`) that session (`taken`), which
 * this device joins.
 */
async function pickName(
  db: Db,
  studyId: number,
  request: ResolveCoderRequest,
  invite: CodersInvite,
): Promise<{ name: string } | { taken: CoderRow }> {
  const name = request.pickedName;
  if (!name || !request.sessionRules!.coders.includes(name))
    throw new HttpError(409, "Pick your name to start", "name_required");
  await advisoryLock(db, `pick_name:${studyId}:${name}`);
  const [taken] = await db
    .select()
    .from(coderSessions)
    .where(and(eq(coderSessions.studyId, studyId), sql`${coderSessions.session}->>'coder' = ${name}`))
    .orderBy(asc(coderSessions.id))
    .limit(1);
  if (!taken) return { name };
  if ((invite.nameDevices ?? "first") === "first")
    throw new HttpError(409, "This name was picked on another device", "name_taken");
  return { taken };
}
