import { useMemo, useState } from "react";
import { CODER_SET, TEST_SET, isEmail, type SetGroupResponse, type UnitSet } from "@annotinder/contracts";
import { Loader2 } from "lucide-react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useCoderUnitsQuery, usePutSetGroupMutation, useUnitsQuery } from "../../../admin/queries";
import {
  coderCounts,
  renameCoder,
  setToCode,
  spreadUnits,
  unassignedUnits,
  type CoderWork,
} from "../../../admin/moveUnits";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "cn";
import { AddCoderForm } from "./AddCoderForm";
import { CoderRow } from "./CoderRow";

/**
 * The coders of the coder set (`coder_set`): per coder their units, coded
 * and still to code. Change how many a coder has to code (fewer: units they
 * haven't coded become unassigned, the ones never sent to them first; more:
 * taken from the unassigned units), hand all of a coder's uncoded units to
 * the others, rename coders who haven't started, or add one. Units a coder
 * coded stay theirs. Nothing changes until "Confirm unit assignments"; then
 * coders get it with the next deploy of the units.
 */
export function CodersDialog({
  client,
  groups,
  onClose,
}: {
  client: ResearcherApi;
  groups: SetGroupResponse[];
  onClose: () => void;
}) {
  const coderUnits = useCoderUnitsQuery(client);
  const units = useUnitsQuery(client).data ?? [];
  const putGroup = usePutSetGroupMutation(client);
  const saved = groups.find((g) => g.name === CODER_SET)?.sets ?? [];
  const tests = groups.find((g) => g.name === TEST_SET)?.sets.flatMap((s) => s.unitIds) ?? [];
  const [sets, setSets] = useState<UnitSet[]>(saved);

  const work: CoderWork = useMemo(
    () =>
      new Map(
        (coderUnits.data?.coders ?? []).map((c) => [c.coder, { coded: new Set(c.coded), served: new Set(c.served) }]),
      ),
    [coderUnits.data],
  );
  const counts = coderCounts(sets, work);
  const unassigned = unassignedUnits(
    units.map((u) => u.id),
    sets,
    tests,
  );
  const names = sets.map((s) => s.name);
  const emails = names.length > 0 && names.every(isEmail);
  const changed = JSON.stringify(sets) !== JSON.stringify(saved);
  const started = (coder: string) => (work.get(coder)?.coded.size ?? 0) + (work.get(coder)?.served.size ?? 0) > 0;
  const taken = (name: string, except?: string) =>
    names.some((n) => n !== except && n.toLowerCase() === name.trim().toLowerCase());

  const setTarget = (coder: string, target: number) => setSets((s) => setToCode(s, coder, target, work, unassigned));
  const rename = (from: string, typed: string) => {
    const to = typed.trim();
    if (to && to !== from && !taken(to, from)) setSets((s) => renameCoder(s, from, to));
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-3xl flex-col gap-4 sm:max-w-3xl">
        <div className="flex flex-col gap-1 pr-6">
          <DialogTitle>Coders</DialogTitle>
          <DialogDescription>
            How many units each coder still has to code. Units a coder coded stay theirs. Coders get the changes when
            you deploy the units.
          </DialogDescription>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              unassigned.length > 0 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-muted",
            )}
          >
            {unassigned.length} unassigned {unassigned.length === 1 ? "unit" : "units"}
          </span>
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={emails} readOnly disabled className="h-3.5 w-3.5 accent-primary" />
            All coders are email addresses
            <InfoTip label="About email addresses">
              With email addresses as their names, coders can sign in instead of each getting their own link (Who codes:
              coders sign in with the email address in the coder set). Signing in proves who codes; a link works for
              whoever has it. Rename the coders to their addresses to use it.
            </InfoTip>
          </label>
        </div>

        {coderUnits.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : (
          <div className="min-h-0 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Coder</th>
                  <th className="py-1 text-right font-medium">Coded</th>
                  <th className="py-1 pl-4 font-medium">To code</th>
                </tr>
              </thead>
              <tbody>
                {counts.map((c) => (
                  <CoderRow
                    key={c.coder}
                    coder={c.coder}
                    coded={c.coded}
                    toCode={c.toCode}
                    unassigned={unassigned.length}
                    started={started(c.coder)}
                    canHandOver={names.length > 1}
                    onRename={(to) => rename(c.coder, to)}
                    onTarget={(target) => setTarget(c.coder, target)}
                    onHandOver={() => setSets((s) => spreadUnits(s, c.coder, work).sets)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <AddCoderForm taken={taken} onAdd={(name) => setSets((s) => [...s, { name, unitIds: [], ordered: false }])} />

        {putGroup.isError && <p className="text-sm text-destructive">{putGroup.error.message}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!changed || putGroup.isPending}
            onClick={() => putGroup.mutate({ group: CODER_SET, body: { sets } }, { onSuccess: onClose })}
          >
            {putGroup.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Confirm unit assignments
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
