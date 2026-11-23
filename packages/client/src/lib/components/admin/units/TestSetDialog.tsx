import { useState } from "react";
import {
  TEST_SET,
  TEST_SET_TYPES,
  distributeUnits,
  type SetGroupResponse,
  type TestSetType,
} from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { usePutSetGroupMutation, useUnitsQuery } from "../../../admin/queries";
import { TEST_LABELS, TEST_SET_INFO, testSetsOf } from "../../../admin/setKinds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Makes the units' `test_set` (docs/plans/unit-sets.md): this many units of
 * each type, drawn at random (seeded) from all units, as the coder set
 * dialog's "Redistribute test units" does; practice units in the order
 * drawn. An existing test set is overwritten, after asking.
 */
export function TestSetDialog({
  client,
  groups,
  onDone,
}: {
  client: ResearcherApi;
  groups: SetGroupResponse[];
  onDone: () => void;
}) {
  const unitIds = (useUnitsQuery(client).data ?? []).map((u) => u.id);
  const putGroup = usePutSetGroupMutation(client);
  const existing = groups.find((g) => g.name === TEST_SET);
  const [counts, setCounts] = useState<Record<TestSetType, number>>(
    () =>
      Object.fromEntries(
        TEST_SET_TYPES.map((t) => [t, existing?.sets.find((s) => s.name === t)?.unitIds.length ?? 0]),
      ) as Record<TestSetType, number>,
  );
  const [confirming, setConfirming] = useState(false);
  const [seed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const total = TEST_SET_TYPES.reduce((n, t) => n + counts[t], 0);
  const problem =
    unitIds.length === 0
      ? "The study has no units yet: upload them first."
      : total === 0
        ? "Give a number of units for at least one type."
        : total >= unitIds.length
          ? `There are ${unitIds.length} units: leave some for coding.`
          : null;

  const save = () => {
    const { testUnits } = distributeUnits(unitIds, [], { newTestUnits: counts, seed });
    putGroup.mutate({ group: TEST_SET, body: { sets: testSetsOf(testUnits) } }, { onSuccess: onDone });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onDone()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Make the test set anew" : "New test set"}</DialogTitle>
          <DialogDescription>
            Draws test units at random from the {unitIds.length} units, as the units&apos; test set (
            <span className="font-mono">test_set</span>). Every coder gets them, besides their own units.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          {TEST_SET_TYPES.map((type) => (
            <label key={type} className="flex items-center gap-2 text-xs" title={TEST_SET_INFO[type]}>
              <span className="w-32 font-semibold">{TEST_LABELS[type]}</span>
              <Input
                type="number"
                aria-label={TEST_LABELS[type]}
                min={0}
                className="h-8 w-20 text-xs"
                value={counts[type]}
                onChange={(e) => setCounts({ ...counts, [type]: Math.max(0, Math.floor(Number(e.target.value))) })}
              />
              units
            </label>
          ))}
          <p className="text-xs text-muted-foreground">
            Practice units come in the order drawn (<span className="font-mono">practice#1</span>, …). Practice and gold
            units need their right answers (<span className="font-mono">answer_&lt;question&gt;</span>): upload them
            with the units, or write them in the unit loop&apos;s Units settings.
          </p>
          {problem && <p className="text-xs text-destructive">{problem}</p>}
          {putGroup.isError && <p className="text-xs text-destructive">{putGroup.error.message}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onDone}>
              Cancel
            </Button>
            {confirming && existing && (
              <span className="mr-auto self-center text-xs text-amber-700 dark:text-amber-400">
                The test set exists ({existing.sets.map((s) => `${s.unitIds.length} ${s.name}`).join(", ")}): overwrite
                it?
              </span>
            )}
            <Button
              disabled={problem !== null || putGroup.isPending}
              onClick={() => (existing && !confirming ? setConfirming(true) : save())}
            >
              {putGroup.isPending ? "Making…" : confirming && existing ? "Overwrite" : "Make the test set"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
