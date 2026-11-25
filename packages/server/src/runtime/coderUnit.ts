import {
  type UnitData,
  TEST_SET,
  answerColumn,
  feedbackColumn,
  parseAnswerKey,
  type CoderUnitResponse,
  type VariableValue,
  own,
} from "@annotinder/contracts";
import { HttpError } from "../shared/http.js";
import type { Store } from "./store.js";
import type { Coder, Unit } from "./types.js";
import { type Deployed } from "./deployed.js";
import { routeOf, routeUnits, testUnits, type Route } from "./shares.js";
import { closed } from "./sessionEnd.js";

// A unit as a coder gets it.

/**
 * A unit the coder already worked on in a loop (has answers for, or holds
 * a lease on), so a resumed session can navigate back to it.
 */
export async function loopUnit(
  d: Deployed,
  coder: Coder,
  loopName: string,
  unitId: number,
): Promise<CoderUnitResponse> {
  if (closed(d, coder)) throw new HttpError(409, "This session has ended", "session_closed");
  if (!d.loops.has(loopName)) throw new HttpError(404, `No unit loop '${loopName}'`);
  const route = routeOf(d, coder, d.loops.get(loopName)!);
  const [answers, leases, coded] = await Promise.all([
    d.store.unitAnswers(coder.sessionId, unitId),
    d.store.listLeases({ sessionId: coder.sessionId }),
    d.store.listCodings({ loop: loopName, sessionId: coder.sessionId }),
  ]);
  const answered = Object.keys(answers).length > 0;
  const held = leases.some((l) => l.loop === loopName && l.unitId === unitId);
  // A unit the coder coded here stays theirs, also if the units were divided differently since
  const codedHere = coded.some((c) => c.unitId === unitId);
  // Only units the coder has worked on (or holds): no peeking ahead.
  if (!(routeUnits(d, route).has(unitId) || codedHere) || !(answered || held))
    throw new HttpError(404, "This unit is not part of your session");
  const unit = (await getUnits(d, [unitId])).get(unitId);
  if (!unit) throw new HttpError(404, "Unit not found");
  const shown = await markServed(d, coder.sessionId, unit);
  return coderUnit(d, route, unit, shown.data, answers);
}

/**
 * A unit as the coder gets it. `$unit.test_set` is the test set the loop
 * places it in (null for a coding unit): sent when the design uses it, and
 * always on practice units (instructions can open on them). A practice unit
 * comes with its checks: the answer cells of the loop's practice questions
 * and their feedback, checked in the browser (docs/architecture.md §6.2).
 * Gold cells never leave the server.
 */
export function coderUnit(
  d: Deployed,
  route: Route | null,
  unit: { id: number; externalId: string; data: UnitData },
  shown: UnitData,
  answers: Record<string, VariableValue>,
): CoderUnitResponse {
  const base = { id: unit.id, externalId: unit.externalId, variables: answers };
  const testSet = (route && testUnits(d, route).find((s) => s.units.includes(unit.id))?.type) ?? null;
  const data = testSet === "practice" || d.shownFields.includes(TEST_SET) ? { ...shown, test_set: testSet } : shown;
  if (!route || testSet !== "practice") return { ...base, data };
  const practice = route.units.practice;
  const questions: NonNullable<CoderUnitResponse["practice"]>["questions"] = {};
  for (const name of practice?.questions ?? []) {
    const key = String(own(unit.data, answerColumn(name)) ?? "").trim();
    if (!parseAnswerKey(key)) continue;
    const message = String(own(unit.data, feedbackColumn(name)) ?? "").trim();
    questions[name] = { key, ...(message ? { message } : {}) };
  }
  const checks =
    Object.keys(questions).length > 0
      ? {
          practice: {
            retry: practice?.retry ?? true,
            ...(practice?.message ? { message: practice.message } : {}),
            questions,
          },
        }
      : {};
  return { ...base, data, ...checks };
}

/**
 * A unit as coders see it under this design (docs/architecture.md
 * §8.4): only the fields it uses (`shownUnitFields`), and the deployed
 * unit version (answers point to it). `$unit.id` is the unit's id, unless
 * the units have a field called id.
 */
export function shownVersion(d: Deployed, unit: Unit): { data: UnitData; versionId: number } {
  const data: UnitData = Object.fromEntries(
    d.shownFields.filter((f) => Object.hasOwn(unit.data, f)).map((f) => [f, unit.data[f]]),
  );
  if (d.shownFields.includes("id") && !Object.hasOwn(unit.data, "id")) data.id = unit.externalId;
  return { data, versionId: unit.versionId };
}

/** Records which version of a unit the coder was shown; returns it. */
export async function markServed(
  d: Deployed,
  sessionId: number,
  unit: Unit,
): Promise<{ data: UnitData; versionId: number }> {
  const shown = shownVersion(d, unit);
  await d.store.recordServe(sessionId, unit.id, shown.versionId);
  return shown;
}

export async function getUnits(d: Deployed, ids: number[], store: Store = d.store): Promise<Map<number, Unit>> {
  return new Map((await store.getUnits(ids, d.spec.liveUnits)).map((unit) => [unit.id, unit]));
}
