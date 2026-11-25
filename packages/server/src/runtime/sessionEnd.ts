import { resolveRedirects, type EndUnit, type EndValues, type Reopen } from "@annotinder/contracts";
import { HttpError } from "../shared/http.js";
import type { Coder, CoderValue } from "./types.js";
import { findEndItem } from "./designItems.js";
import { plainValues, type Deployed } from "./deployed.js";
import { getUnits } from "./coderUnit.js";

// How a session ends, and whether it can be opened again.

export function assertOpen(d: Deployed, coder: Coder): void {
  if (coder.ended) throw new HttpError(409, "This session has ended", "session_ended");
}

/**
 * The coder reached an `end` item: the session is over (screened out or
 * complete), and nothing more is accepted. Its outcome comes from the
 * design. Reaching it again (e.g. after a reload) changes nothing. An
 * end inside a unit loop names the unit (one the coder answered), so the
 * ending can be shown again with its values.
 */
export async function endSession(
  d: Deployed,
  coder: Coder,
  item?: string,
  unit?: EndUnit,
): Promise<{ reopen: Reopen }> {
  if (coder.ended) return { reopen: reopen(d, coder) };
  // Without an item: the coder went through the whole study.
  const end = item === undefined ? null : findEndItem(d.spec.design.items, item);
  if (item !== undefined && !end) throw new HttpError(400, `No end item '${item}'`);
  if (
    unit &&
    (!d.loops.has(unit.loop) || Object.keys(await d.store.unitAnswers(coder.sessionId, unit.id)).length === 0)
  ) {
    throw new HttpError(400, "The end's unit is not one you answered");
  }
  coder.ended = {
    ...(item ? { item } : {}),
    ...(unit ? { unit } : {}),
    outcome: end?.outcome ?? "complete",
    at: new Date(d.options.now()),
  };
  await d.store.setEnded(coder.sessionId, coder.ended);
  return { reopen: reopen(d, coder) };
}

/**
 * Whether an ended session can be opened again: after completing it,
 * within the study's reopen time (`reopenMinutes`; null: always). Not after a
 * screenout (the answers that screened the coder out stay), quitting, or
 * asking for deletion.
 */
export function reopen(d: Deployed, coder: Coder): Reopen {
  const { ended } = coder;
  if (!ended || ended.outcome !== "complete" || coder.deletionRequest) return null;
  if (d.spec.reopenMinutes === null) return { until: null };
  const until = new Date(new Date(ended.at).getTime() + d.spec.reopenMinutes * 60_000);
  return until.getTime() > d.options.now() ? { until } : null;
}

/** Goes back after completing the session (`reopen`): it is open again. */
export async function reopenSession(d: Deployed, coder: Coder): Promise<void> {
  if (!coder.ended) return;
  if (!reopen(d, coder)) throw new HttpError(409, "This session has ended", "session_closed");
  coder.ended = null;
  await d.store.setEnded(coder.sessionId, null);
}

/** An ended session is closed, unless the study keeps sessions open: the coder gets only what the end screen shows. */
export function closed(d: Deployed, coder: Coder): boolean {
  return coder.ended !== null && d.spec.reopenMinutes !== null;
}

/** The values an ended session's end screen uses (contracts EndValues): its message's and redirect link's references. */
export async function endValues(
  d: Deployed,
  coder: Coder,
  values: Record<string, CoderValue>,
): Promise<EndValues | null> {
  const { ended } = coder;
  if (!ended) return null;
  const found = ended.item ? findEndItem(d.spec.design.items, ended.item) : null;
  // A panel return link from the deployment settings counts too
  const end = found ? resolveRedirects([found], d.spec.redirectUrls)[0] : null;
  const source = `${end?.message ?? ""}\n${end?.redirectUrl ?? ""}`;
  // Every `$var.x` / `$unit.x` written anywhere in them (texts, scripts, branch conditions).
  const names = (ns: string) =>
    new Set([...source.matchAll(new RegExp(`\\$${ns}\\.([A-Za-z0-9_]+)`, "g"))].map((m) => m[1]));
  const pick = <T>(values: Record<string, T>, wanted: Set<string>) =>
    Object.fromEntries(Object.entries(values).filter(([k]) => wanted.has(k)));
  const vars = names("var");
  let unit: EndValues["unit"] = null;
  if (ended.unit) {
    const [data, answers] = await Promise.all([
      getUnits(d, [ended.unit.id]).then((units) => units.get(ended.unit!.id)?.data ?? {}),
      d.store.unitAnswers(coder.sessionId, ended.unit.id),
    ]);
    unit = { data: pick(data, names("unit")), variables: pick(answers, vars) };
  }
  return { variables: pick(plainValues(values), vars), unit };
}

/**
 * The coder quits: the session ends (if it hadn't: an ending at an `end`
 * item stays). With `requestDeletion` they ask for their answers to be
 * deleted, also after the session ended; the researcher decides.
 */
export async function quitSession(d: Deployed, coder: Coder, requestDeletion: boolean): Promise<void> {
  const at = new Date(d.options.now());
  if (!coder.ended) {
    coder.ended = { outcome: "quit", at };
    await d.store.setEnded(coder.sessionId, coder.ended);
  }
  if (requestDeletion) {
    coder.deletionRequest = { at };
    await d.store.requestDeletion(coder.sessionId, coder.deletionRequest);
  }
}
