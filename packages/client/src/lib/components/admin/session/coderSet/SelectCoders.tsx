import { useMemo, useState } from "react";
import { CODER_SET, TEST_SET, TEST_SET_TYPES, type CoderResponse, type SetGroupResponse } from "@annotinder/contracts";
import type { ResearcherApi } from "../../../../api/httpResearcherApi";
import {
  codedBy,
  coderSetProblem,
  currentTestCounts,
  planCoderSet,
  preselectedCoders,
  unitsWithoutCoder,
  type CoderSetChoices,
  type CoderSetInput,
  type CoderSetPlan,
} from "../../../../admin/coderSet";
import {
  useCoderUnitsQuery,
  useDeleteSetGroupMutation,
  usePutSetGroupMutation,
  useUnitsQuery,
} from "../../../../admin/queries";
import { Button } from "@/components/ui/button";
import { AssignModeChoice } from "../../units/AssignMode";
import { CoderChecklist } from "./CoderChecklist";
import { KeepCodedChoice, PerUnitChoice, TestUnitsChoice } from "./DistributionChoices";

/**
 * "Select coders": which expert coders get units (those of the draft's coder
 * set to start with, or all without one), and how the units are divided:
 * every unit to one or more coders, or everything to everyone; test units
 * kept or drawn anew; units a coder coded stay theirs. An existing coder set
 * is overwritten (after asking), or only its units without a coder are
 * given out. The units are shuffled first (seeded).
 */
export function SelectCoders({
  client,
  groups,
  experts,
  onManage,
  onDone,
}: {
  client: ResearcherApi;
  groups: SetGroupResponse[];
  experts: readonly CoderResponse[];
  onManage: () => void;
  onDone: () => void;
}) {
  const units = useUnitsQuery(client).data;
  const seen = useCoderUnitsQuery(client).data;
  const input: CoderSetInput = useMemo(
    () => ({
      unitIds: (units ?? []).map((u) => u.id),
      groups,
      coded: new Map((seen?.coders ?? []).map((c) => [c.coder, c.coded])),
    }),
    [units, seen, groups],
  );
  const existing = groups.find((g) => g.name === CODER_SET);
  const [choices, setChoices] = useState<CoderSetChoices>(() => ({
    coders: preselectedCoders(
      experts.map((c) => c.coder),
      groups,
    ),
    mode: "anew",
    everyone: false,
    perUnit: 1,
    redistribute: false,
    testCounts: currentTestCounts(groups),
    keep: true,
    seed: Math.floor(Math.random() * 1_000_000),
  }));
  const change = (patch: Partial<CoderSetChoices>) => setChoices((c) => ({ ...c, ...patch }));
  const assigning = existing !== undefined && choices.mode === "empty";
  const problem = coderSetProblem(input, choices);
  const plan = planCoderSet(input, choices);
  const coded = codedBy(input, choices.coders);
  const save = useSaveCoderSet(client, groups, onDone);

  return (
    <div className="flex flex-col gap-3 text-sm">
      <CoderChecklist
        experts={experts}
        selected={choices.coders}
        onChange={(coders) => change({ coders })}
        onManage={onManage}
      />
      {existing && (
        <AssignModeChoice
          label="coder set"
          mode={choices.mode}
          empty={unitsWithoutCoder(input).length}
          onChange={(mode) => change({ mode })}
        />
      )}
      <PerUnitChoice choices={choices} onChange={change} />
      {!assigning && <TestUnitsChoice choices={choices} current={currentTestCounts(groups)} onChange={change} />}
      {!problem && <p className="text-xs text-muted-foreground">{planSummary(input, choices, plan, assigning)}</p>}
      {coded.size > 0 && !assigning && (
        <KeepCodedChoice choices={choices} coded={coded} kept={plan.kept} onChange={change} />
      )}
      {problem && <p className="text-xs text-destructive">{problem}</p>}
      {save.error && <p className="text-xs text-destructive">{save.error.message}</p>}
      <SaveBar
        saving={save.saving}
        disabled={problem !== null}
        // Overwriting a coder set asks first
        overwrites={existing && !assigning ? existing.sets.length : null}
        label={assigning ? `Assign ${unitsWithoutCoder(input).length} units` : "Make the coder set"}
        onCancel={onDone}
        onSave={() => void save.save(plan)}
      />
    </div>
  );
}

/** What saving will do, in a sentence. */
function planSummary(input: CoderSetInput, choices: CoderSetChoices, plan: CoderSetPlan, assigning: boolean): string {
  const coders = `${choices.coders.length} coder${choices.coders.length === 1 ? "" : "s"}`;
  if (assigning) {
    const empty = unitsWithoutCoder(input).length;
    return `Gives the ${empty} unit${empty === 1 ? "" : "s"} without a coder to the ${coders} selected, those with the fewest units first. Current assignments stay.`;
  }
  const counts = choices.redistribute ? choices.testCounts : currentTestCounts(input.groups);
  const tests = TEST_SET_TYPES.filter((t) => counts[t] > 0).map((t) => `${counts[t]} ${t}`);
  const each = Math.round(plan.sets.reduce((n, s) => n + s.unitIds.length, 0) / Math.max(1, plan.sets.length));
  return `${coders}, each with ${choices.everyone ? "" : "about "}${each} units${
    tests.length > 0 ? `, plus ${tests.join(", ")} test units for everyone` : ""
  }. Units are shuffled first.`;
}

/** Saving a plan: the coder set, and the test set if it was drawn anew. */
function useSaveCoderSet(client: ResearcherApi, groups: SetGroupResponse[], onSaved: () => void) {
  const putGroup = usePutSetGroupMutation(client);
  const deleteGroup = useDeleteSetGroupMutation(client);
  const hasTests = groups.some((g) => g.name === TEST_SET);
  return {
    saving: putGroup.isPending || deleteGroup.isPending,
    error: putGroup.error ?? deleteGroup.error,
    save: async (plan: CoderSetPlan) => {
      try {
        await putGroup.mutateAsync({ group: CODER_SET, body: { sets: plan.sets } });
        if (plan.testSets && plan.testSets.length > 0)
          await putGroup.mutateAsync({ group: TEST_SET, body: { sets: plan.testSets } });
        else if (plan.testSets && hasTests) await deleteGroup.mutateAsync(TEST_SET);
        onSaved();
      } catch {
        // Shown above the buttons (the mutation's error)
      }
    },
  };
}

/** Cancel and save; overwriting a coder set of `overwrites` coders is confirmed with a second click. */
function SaveBar({
  saving,
  disabled,
  overwrites,
  label,
  onCancel,
  onSave,
}: {
  saving: boolean;
  disabled: boolean;
  overwrites: number | null;
  label: string;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const ask = overwrites !== null && !confirming;
  return (
    <div className="flex justify-end gap-2">
      {confirming && overwrites !== null && (
        <span className="mr-auto self-center text-xs text-amber-700 dark:text-amber-400">
          The coder set exists ({overwrites} coders): overwrite it?
        </span>
      )}
      <Button variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button disabled={disabled || saving} onClick={() => (ask ? setConfirming(true) : onSave())}>
        {saving ? "Making…" : confirming && overwrites !== null ? "Overwrite" : label}
      </Button>
    </div>
  );
}
