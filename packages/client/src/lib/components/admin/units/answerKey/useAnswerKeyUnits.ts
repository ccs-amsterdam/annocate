import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { UnitField, UnitResponse } from "@annotinder/contracts";
import type { ResearcherApi } from "../../../../api/httpResearcherApi";
import { cellOf, changedUnits, unitsWithEdits, type CellEdits } from "../../../../admin/answerKey";

/** The most units asked for and uploaded at a time. */
const BATCH = 200;

/** Every unit of a set, page by page. */
async function unitsOfSet(client: ResearcherApi, group: string, set: string): Promise<UnitResponse[]> {
  const all: UnitResponse[] = [];
  for (;;) {
    const page = await client.listUnitPage({ offset: all.length, limit: BATCH, group, set });
    all.push(...page.units);
    if (page.units.length === 0 || all.length >= page.total) return all;
  }
}

/**
 * The units of a set with the cells typed for them in the "Right answers"
 * dialog: loaded once, edited in memory, and uploaded on `save` (which
 * resolves to whether it worked; `error` says why not).
 */
export function useAnswerKeyUnits(client: ResearcherApi, group: string, set: string) {
  const queryClient = useQueryClient();
  const [units, setUnits] = useState<UnitResponse[] | null>(null);
  const [fields, setFields] = useState<UnitField[]>([]);
  const [edits, setEdits] = useState<CellEdits>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([unitsOfSet(client, group, set), client.getUnitFields()]).then(
      ([all, known]) => {
        if (cancelled) return;
        setUnits(all);
        setFields(known);
      },
      (err: unknown) => setError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [client, group, set]);

  async function save(): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const body = unitsWithEdits(units ?? [], edits, fields);
      // Answer columns are never shown to coders, so writing them makes no new unit versions.
      for (let i = 0; i < body.length; i += BATCH)
        await client.createUnits({ units: body.slice(i, i + BATCH), overwriteCoded: true });
      await queryClient.invalidateQueries();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  return {
    /** null while loading. */
    units,
    cell: (unit: UnitResponse, column: string) => cellOf(unit, column, edits),
    setCell: (unit: UnitResponse, column: string, value: string) =>
      setEdits((e) => ({ ...e, [unit.id]: { ...e[unit.id], [column]: value } })),
    /** How many units have a changed cell. */
    changed: changedUnits(units ?? [], edits).length,
    error,
    saving,
    save,
  };
}
