import {
  type AnswerTiming,
  type AnyVariableType,
  answerColumn,
  parseAnswerKey,
  answerMatchesKey,
  type SubmitUnitResponse,
  type ResolvedLoopUnits,
  type VariableValue,
  validateVariables,
  resolveVariable,
  own,
} from "@annotinder/contracts";
import { HttpError } from "../shared/http.js";
import type { Coder } from "./types.js";
import { finishedLoops, type LoopInfo } from "./designItems.js";
import { agreementKeys, type Deployed } from "./deployed.js";
import { ownUnits, routeOf, testUnitsOf, testUnits } from "./shares.js";
import { getUnits, shownVersion } from "./coderUnit.js";
import { assertOpen, endSession } from "./sessionEnd.js";

// Answers coming in: a finished unit, and coder-level answers.

/**
 * Coder-level answers: a row each (only those that changed), like unit
 * answers. Values for random conditions, and for frozen answers, are
 * ignored: those don't change.
 */
export async function submitCoderVariables(
  d: Deployed,
  coder: Coder,
  variables: Record<string, VariableValue>,
  deviceId: number | null = null,
  timings: Record<string, AnswerTiming> = {},
): Promise<void> {
  assertOpen(d, coder);
  const errors = validateVariables(d.coderVariableTypes, variables);
  if (errors.length > 0) throw new HttpError(400, errors.join("; "));
  const randomNames = new Set(d.randomVariables.map(([name]) => name));
  const stored = await d.store.coderValues(coder.sessionId);
  const open = (name: string) => !randomNames.has(name) && !own(stored, name)?.assigned && !own(stored, name)?.frozen;
  const changed = Object.fromEntries(
    Object.entries(variables).filter(
      ([name, value]) => open(name) && JSON.stringify(own(stored, name)?.value) !== JSON.stringify(value),
    ),
  );
  // Timings of answered questions only (an unchanged answer: its timing alone is updated)
  const timed = Object.fromEntries(
    Object.entries(timings).filter(
      ([name]) => open(name) && (Object.hasOwn(changed, name) || Object.hasOwn(stored, name)),
    ),
  );
  if (Object.keys(changed).length === 0 && Object.keys(timed).length === 0) return;
  await d.store.checkAnswers(changed);
  await d.store.putCoderValues({
    sessionId: coder.sessionId,
    values: changed,
    designVersionId: d.spec.design.id,
    deviceId,
    timings: timed,
  });
}

/**
 * A finished unit: answers to every question of the loop (`skip` for
 * questions a condition hid). Partial submissions are refused, so a stored
 * unit is always complete under the design it was written with.
 */
export async function submitUnit(
  d: Deployed,
  coder: Coder,
  unitId: number,
  variables: Record<string, VariableValue>,
  loopName?: string,
  deviceId: number | null = null,
  timings: Record<string, AnswerTiming> = {},
): Promise<SubmitUnitResponse> {
  assertOpen(d, coder);
  const loops = await submittableLoops(d, coder, unitId, loopName);
  if (loops.length === 0) throw new HttpError(409, "Unit is not assigned to this coder");

  const info = loops.find((l) => [...l.variables.keys()].every((name) => Object.hasOwn(variables, name)));
  if (!info) {
    const missing = [...loops[0].variables.keys()].filter((name) => !Object.hasOwn(variables, name));
    throw new HttpError(400, `Unit not finished: no answer for ${missing.join(", ")}`);
  }
  const earlier = await d.store.unitAnswers(coder.sessionId, unitId);
  await validateAnswers(d, info, unitId, earlier, variables);
  await writeAnswers(d, coder, unitId, earlier, variables, deviceId, timings);
  // The coder-level answers this loop depends on can't change any more.
  await d.store.freezeCoderValues(coder.sessionId, d.dependencies.get(info.key) ?? []);
  return checkGold(d, coder, info, unitId);
}

/**
 * Refuses answers that don't fit the loop's questions (400), or are too
 * large or too many (`Store.checkAnswers`). Options from data are the
 * unit's (its list fields, its earlier spans): checked as the coder saw them.
 */
async function validateAnswers(
  d: Deployed,
  info: LoopInfo,
  unitId: number,
  earlier: Record<string, VariableValue>,
  variables: Record<string, VariableValue>,
): Promise<void> {
  const types = await unitVariableTypes(d, info.variables, unitId, { ...earlier, ...variables });
  const errors = validateVariables(types, variables);
  if (errors.length > 0) throw new HttpError(400, errors.join("; "));
  await d.store.checkAnswers(variables);
}

/** The unit version the coder saw (which may be older than the unit's content now), if the unit still exists. */
async function versionSeen(d: Deployed, coder: Coder, unitId: number): Promise<number | undefined> {
  const served = await d.store.servedVersion(coder.sessionId, unitId);
  if (served !== null) return served;
  const unit = (await getUnits(d, [unitId])).get(unitId);
  return unit && shownVersion(d, unit).versionId;
}

/**
 * Stores a unit's answers, with the loops they (and the unit's earlier
 * ones) finish it in. Values of other variables (e.g. questions an update
 * removed) are left alone, so they stay as data.
 */
async function writeAnswers(
  d: Deployed,
  coder: Coder,
  unitId: number,
  earlier: Record<string, VariableValue>,
  variables: Record<string, VariableValue>,
  deviceId: number | null,
  timings: Record<string, AnswerTiming>,
): Promise<void> {
  const merged = { ...earlier, ...variables };
  const codings = finishedLoops(merged, d.loops.values()).map((l) => ({
    loop: l.key,
    agreement: agreementKeys(merged, l),
  }));
  await d.store.putAnnotation({
    unitId,
    sessionId: coder.sessionId,
    variables,
    designVersionId: d.spec.design.id,
    unitVersionId: await versionSeen(d, coder, unitId),
    deviceId,
    timings: Object.fromEntries(Object.entries(timings).filter(([name]) => Object.hasOwn(variables, name))),
    codings,
  });
}

/**
 * After a gold unit (docs/architecture.md §6.2): the coder's answers are
 * checked here, against the unit's answer columns (practice: in the
 * browser). Out of health: the session ends at the loop's end item.
 */
async function checkGold(d: Deployed, coder: Coder, info: LoopInfo, unitId: number): Promise<SubmitUnitResponse> {
  const route = routeOf(d, coder, info);
  const gold = route?.units.gold;
  if (!route || !gold?.health || !testUnitsOf(d, route, "gold").includes(unitId)) return {};
  const health = await goldHealth(d, coder, info.key, gold, testUnitsOf(d, route, "gold"));
  if (health > 0) return {};
  await endSession(d, coder, gold.health.end);
  return { end: gold.health.end };
}

/**
 * The loops (`loopName`: only that one) the coder may submit this unit in:
 * units in their route; in a shared queue only their own earlier codings
 * (editing after going back) or the unit leased to them (an expired lease
 * still counts: at worst one coding too many).
 */
async function submittableLoops(d: Deployed, coder: Coder, unitId: number, loopName?: string): Promise<LoopInfo[]> {
  // Leases first (as in `pick`): a submit of this unit finishing in between shows up as a coding.
  const leases = await d.store.listLeases({ sessionId: coder.sessionId });
  const coded = await d.store.listCodings({ sessionId: coder.sessionId });
  const canSubmit = (info: LoopInfo) => {
    // A unit the coder coded here stays theirs (editing after going back), also if the units were divided differently since
    if (coded.some((c) => c.loop === info.key && c.unitId === unitId)) return true;
    const route = routeOf(d, coder, info);
    if (!route) return false;
    if (testUnits(d, route).some((s) => s.units.includes(unitId))) return true;
    if (!ownUnits(d, route).includes(unitId)) return false;
    if (!route.units.criteria) return true;
    return leases.some((l) => l.loop === info.key && l.unitId === unitId);
  };
  return [...d.loops.values()].filter((info) => (loopName === undefined || info.key === loopName) && canSubmit(info));
}

/** A loop's questions with their options from data resolved for a unit (`resolveVariable`); unchanged without any. */
async function unitVariableTypes(
  d: Deployed,
  variables: Map<string, AnyVariableType>,
  unitId: number,
  answers: Record<string, VariableValue>,
): Promise<Map<string, AnyVariableType>> {
  if (![...variables.values()].some((v) => v.type === "nominal" && v.optionsFrom)) return variables;
  const unit = (await getUnits(d, [unitId])).get(unitId);
  const ctx = { unit: unit?.data, answers, questions: variables };
  return new Map([...variables].map(([name, v]) => [name, resolveVariable(v, ctx)]));
}

/**
 * A coder's gold health in a loop: it starts at `start`, and each checked
 * question on a gold unit they finished changes it, in the order they
 * finished them: `wrong` when wrong, `right` when right (never above
 * `start`). Rebuilt from their answers and the units' answer columns.
 */
async function goldHealth(
  d: Deployed,
  coder: Coder,
  loop: string,
  gold: NonNullable<ResolvedLoopUnits["gold"]>,
  goldUnits: number[],
): Promise<number> {
  const health = gold.health!;
  const codings = (await d.store.listCodings({ sessionId: coder.sessionId, loop }))
    .filter((c) => goldUnits.includes(c.unitId))
    .sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
  const units = await getUnits(
    d,
    codings.map((c) => c.unitId),
  );
  let value = health.start;
  for (const coding of codings) {
    const unit = units.get(coding.unitId);
    if (!unit) continue;
    const answers = await d.store.unitAnswers(coder.sessionId, coding.unitId);
    for (const name of gold.questions ?? []) {
      const expected = parseAnswerKey(own(unit.data, answerColumn(name)));
      if (expected === null) continue;
      value = answerMatchesKey(own(answers, name), expected)
        ? Math.min(health.start, value + (health.right ?? 0))
        : value + health.wrong;
    }
  }
  return value;
}
