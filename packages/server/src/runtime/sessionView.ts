import { ALL_UNITS_SET, type SessionResponse } from "@annotinder/contracts";
import type { Coder } from "./types.js";
import { plainValues, type Deployed } from "./deployed.js";
import { expectedUnits, routeOf, routeUnits } from "./shares.js";
import { closed, endValues, reopen } from "./sessionEnd.js";

// The session as the client loads it.

/** The session for the client. */
export async function sessionResponse(d: Deployed, coder: Coder): Promise<SessionResponse> {
  const newUnits = await noticeNewUnits(d, coder);
  const values = await d.store.coderValues(coder.sessionId);
  const [endScreen, codings] = await Promise.all([
    endValues(d, coder, values),
    d.store.listCodings({ sessionId: coder.sessionId }),
  ]);
  const live = new Set(d.sets.get(ALL_UNITS_SET) ?? []);
  return {
    sessionId: coder.sessionId,
    // Only what coding needs (contracts toCoderItems): not how units are handed out
    codebook: d.coderCodebook,
    version: d.spec.version,
    progress: [...d.loops.values()].map((info) => {
      const route = routeOf(d, coder, info);
      const units = routeUnits(d, route);
      // Units the coder coded here stay theirs, also once moved to another coder (not once deleted)
      const done = codings.filter((c) => c.loop === info.key && (units.has(c.unitId) || live.has(c.unitId)));
      const expected = expectedUnits(d, route);
      const elsewhere = done.filter((c) => !units.has(c.unitId)).length;
      return {
        loop: info.key,
        doneUnitIds: done.map((c) => c.unitId),
        totalUnits: expected === null ? null : expected + elsewhere,
      };
    }),
    // A closed session: only what its end screen shows.
    variables: closed(d, coder) ? (endScreen?.variables ?? {}) : plainValues(values),
    frozen: closed(d, coder) ? [] : Object.keys(values).filter((name) => values[name].frozen),
    ended: coder.ended,
    endValues: endScreen,
    reopen: reopen(d, coder),
    deletionRequest: coder.deletionRequest,
    session: coder.session,
    login: coder.email,
    newUnits,
  };
}

/**
 * Units the coder got since they last loaded the session (the researcher
 * added units or moved units to them): counted in the loops they reached,
 * where their number doesn't depend on other coders. A finished session
 * that can still be reopened is opened again, so they code them. Told
 * once, with the deployment's message.
 */
async function noticeNewUnits(d: Deployed, coder: Coder): Promise<SessionResponse["newUnits"]> {
  let total = 0;
  for (const info of d.loops.values()) {
    if (coder.assignments[info.key]) total += expectedUnits(d, routeOf(d, coder, info)) ?? 0;
  }
  if (total === coder.knownUnits) return null;
  const count = coder.knownUnits === null ? 0 : total - coder.knownUnits;
  coder.knownUnits = total;
  await d.store.setKnownUnits(coder.sessionId, total);
  if (count <= 0) return null;
  if (coder.ended) {
    // Too late to go back: nothing to tell
    if (!reopen(d, coder)) return null;
    coder.ended = null;
    await d.store.setEnded(coder.sessionId, null);
  }
  const message = d.spec.newUnitsMessage;
  return message ? { count, message: message.replaceAll("{n}", String(count)) } : null;
}
