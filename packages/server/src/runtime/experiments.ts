import { CONDITION_SET, type VariableValue, own } from "@annotinder/contracts";
import { HttpError } from "../shared/http.js";
import type { Store } from "./store.js";
import type { Coder } from "./types.js";
import { singleValue, valueOf } from "./designItems.js";
import { plainValues, type Deployed, type ExperimentVariable } from "./deployed.js";
import { assertOpen } from "./sessionEnd.js";

// Experiments (random conditions): a coder's value, drawn once when they reach it.

/**
 * The coder reached an experiment (a random variable): its value, assigned now if the
 * coder has none yet (random; balanced: the option the fewest coders
 * who reached it have, under a lock; with `stratify`, only among coders
 * with the same answers to those questions, or session values; or the
 * session's URL parameter `param`, which must be a condition). Once
 * assigned it never changes. Coders who never reach it (screened out
 * before) don't count. An experiment that selects units (`units`) draws
 * from `condition_set`'s values unless it lists options, and its value is
 * added to the session's values: it selects the units of the loops after it.
 */
export async function assignCondition(d: Deployed, coder: Coder, name: string): Promise<VariableValue> {
  assertOpen(d, coder);
  const variable = d.randomVariables.find(([n]) => n === name)?.[1];
  if (!variable) throw new HttpError(404, `No experiment '${name}'`);
  const options = conditionOptions(d, variable);
  if (options.length === 0) throw new HttpError(409, `Experiment '${name}' has no values yet`);
  // Linked to units: the value goes into the session values, once (a session value never changes, so
  // the coder's units don't either); the session's value is the variable's
  const linked = async (value: VariableValue): Promise<VariableValue> => {
    const plain = valueOf(value);
    if (!variable.selectsUnits || plain === undefined) return value;
    const kept = await d.store.setSessionValue(coder.sessionId, name, String(plain));
    coder.session = { ...coder.session, [name]: kept };
    return kept === String(plain) ? value : singleValue(kept);
  };
  const stored = own(await d.store.coderValues(coder.sessionId), name);
  if (stored) return linked(stored.value);
  const fixed = fixedCondition(coder, name, variable, options);
  return linked(await drawUnderLock(d, coder, name, variable, options, fixed));
}

type ConditionOption = { value: string; weight?: number };

/** An experiment's conditions: its options, or for one that selects units `condition_set`'s values. */
function conditionOptions(d: Deployed, variable: ExperimentVariable): ConditionOption[] {
  if (variable.options) return variable.options;
  return variable.selectsUnits ? (d.groups.get(CONDITION_SET) ?? []).map((value) => ({ value })) : [];
}

/**
 * The value that isn't drawn, if any: the one already in the session (e.g.
 * its answers were reset: the same value again, not a new draw), or the
 * link's URL parameter, which must be a condition (409 otherwise).
 */
function fixedCondition(
  coder: Coder,
  name: string,
  variable: ExperimentVariable,
  options: ConditionOption[],
): string | undefined {
  const kept = variable.selectsUnits ? own(coder.session, name) : undefined;
  if (kept !== undefined || variable.draw !== "url_param") return kept;
  const given = own(coder.session, variable.param ?? "");
  if (!options.some((o) => o.value === given))
    throw new HttpError(409, `Experiment '${name}': the link's ${variable.param} is not one of its conditions`);
  return given;
}

/**
 * Assigns the value under a lock, unless it was assigned meanwhile: `fixed`,
 * or a draw. A balanced draw counts the other coders, under the
 * experiment's lock; otherwise the coder's own lock: two requests of this
 * coder at once draw once (the first write wins).
 */
function drawUnderLock(
  d: Deployed,
  coder: Coder,
  name: string,
  variable: ExperimentVariable,
  options: ConditionOption[],
  fixed: string | undefined,
): Promise<VariableValue> {
  const balanced = variable.draw === "balanced" && fixed === undefined;
  const lock = balanced ? `balanced/${name}` : `condition/${name}/${coder.sessionId}`;
  return d.store.locked(lock, async (store) => {
    const mine = await store.coderValues(coder.sessionId);
    const again = own(mine, name);
    if (again) return again.value;
    const drawn = balanced
      ? await drawBalanced(d, store, coder, plainValues(mine), name, variable.stratify ?? [], options)
      : (fixed ?? drawWeighted(d, options));
    const value = singleValue(drawn);
    await store.putCoderValues({
      sessionId: coder.sessionId,
      values: { [name]: value },
      assigned: true,
      designVersionId: d.spec.design.id,
    });
    return value;
  });
}

/**
 * A balanced draw (under the item's lock): the option the fewest coders
 * who reached the item have; with `stratify`, counting only coders with
 * the same answers to those questions (or `session.<name>` values).
 */
async function drawBalanced(
  d: Deployed,
  store: Store,
  coder: Coder,
  ownValues: Record<string, VariableValue>,
  name: string,
  stratify: string[],
  options: { value: string }[],
): Promise<string> {
  const stratum = (values: Record<string, VariableValue | undefined>, session: Record<string, string>) =>
    JSON.stringify(
      stratify.map((s) =>
        s.startsWith("session.")
          ? (own(session, s.slice("session.".length)) ?? null)
          : (valueOf(own(values, s)) ?? null),
      ),
    );
  const mine = stratum(ownValues, coder.session);
  const others = (await store.coderValuesOf([name, ...stratify.filter((s) => !s.startsWith("session."))]))
    .filter((c) => stratum(c.values, c.session) === mine)
    .map((c) => own(c.values, name));
  const counts = new Map<string, number>();
  for (const taken of others) {
    const v = valueOf(taken);
    if (v !== undefined) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return leastUsed(
    options.map((o) => o.value),
    (v) => counts.get(v) ?? 0,
    d.options.random,
  );
}

function drawWeighted(d: Deployed, options: { value: string; weight?: number }[]): string {
  const total = options.reduce((n, o) => n + (o.weight ?? 1), 0);
  let r = d.options.random() * total;
  for (const o of options) {
    r -= o.weight ?? 1;
    if (r < 0) return o.value;
  }
  return options[options.length - 1].value;
}

/**
 * Balanced draws: the value the fewest sessions have, a tie broken at
 * random (so the first value isn't always the one that runs ahead when
 * sessions drop out). `random`: a number in [0, 1), as `Math.random`.
 */
function leastUsed(values: readonly string[], count: (value: string) => number, random: () => number): string {
  if (values.length === 0) throw new Error("leastUsed needs at least one value");
  const counts = values.map(count);
  const fewest = Math.min(...counts);
  const tied = values.filter((_, i) => counts[i] === fewest);
  return tied[Math.min(tied.length - 1, Math.floor(random() * tied.length))]!;
}
