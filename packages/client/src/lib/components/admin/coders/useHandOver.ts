import { useMemo } from "react";
import { CODER_SET } from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { coderCounts, spreadUnits, type CoderWork } from "../../../admin/moveUnits";
import { useCoderUnitsQuery, usePutSetGroupMutation, useSetGroupsQuery } from "../../../admin/queries";

/**
 * Handing a coder's units they haven't coded to the other coders of the
 * draft's coder set (`spreadUnits`: to whoever has the fewest left; units
 * they coded stay theirs). `movable`: how many units that is for a coder;
 * `handOver` asks first, then saves the draft's coder set.
 */
export function useHandOver(client: ResearcherApi) {
  const groups = useSetGroupsQuery(client).data;
  const coderUnits = useCoderUnitsQuery(client).data;
  const putGroup = usePutSetGroupMutation(client);
  const sets = useMemo(() => groups?.find((g) => g.name === CODER_SET)?.sets ?? [], [groups]);
  const work: CoderWork = useMemo(
    () =>
      new Map((coderUnits?.coders ?? []).map((c) => [c.coder, { coded: new Set(c.coded), served: new Set(c.served) }])),
    [coderUnits],
  );
  const toCode = useMemo(() => new Map(coderCounts(sets, work).map((c) => [c.coder, c.toCode])), [sets, work]);

  return {
    error: putGroup.error,
    /** Nothing to move without units left to code, or without other coders to take them. */
    movable: (coder: string) => (sets.length > 1 ? (toCode.get(coder) ?? 0) : 0),
    handOver: (coder: string) => {
      const { sets: next, moved } = spreadUnits(sets, coder, work);
      const question = `Move ${moved} unit${moved === 1 ? "" : "s"} ${coder} hasn't coded to the other coders? This changes the draft: deploy the units to apply it.`;
      if (moved > 0 && confirm(question)) putGroup.mutate({ group: CODER_SET, body: { sets: next } });
    },
  };
}
