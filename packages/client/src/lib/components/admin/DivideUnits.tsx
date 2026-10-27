import { useState } from "react";
import { ALL_UNITS_UNITSET, splitUnits, type UnitsetResponse } from "@annotinder/contracts";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import { useCreateInviteMutation, useCreateUnitsetMutation, useUnitsQuery, useUnitsetsQuery } from "../../admin/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** `name`, or `name (2)`, `name (3)`, ... if it is taken. */
function unique(name: string, taken: Set<string>): string {
  let candidate = name;
  for (let n = 2; taken.has(candidate); n++) candidate = `${name} (${n})`;
  taken.add(candidate);
  return candidate;
}

/**
 * Divides units over named coders (docs/client.md §7): splits all units or
 * a unitset into one part per coder plus an overlap set (`splitUnits`,
 * shuffled with a seed), and makes a personal invitation per coder whose
 * units are their part. The codebook then uses "The invitation's units",
 * with the overlap set as its overlap. Who codes what stays out of the
 * codebook: it lives in the invitations.
 */
export function DivideUnits({ client, onDone }: { client: ResearcherApi; onDone: () => void }) {
  const unitsQuery = useUnitsQuery(client);
  const unitsetsQuery = useUnitsetsQuery(client);
  const createUnitset = useCreateUnitsetMutation(client);
  const createInvite = useCreateInviteMutation(client);
  const [source, setSource] = useState(ALL_UNITS_UNITSET);
  const [names, setNames] = useState("Coder 1\nCoder 2\nCoder 3");
  const [overlap, setOverlap] = useState(0);
  const [seed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const unitsets: UnitsetResponse[] = unitsetsQuery.data ?? [];
  const unitIds =
    source === ALL_UNITS_UNITSET ? (unitsQuery.data ?? []).map((u) => u.id) : (unitsets.find((u) => u.name === source)?.unitIds ?? []);
  const coders = names
    .split("\n")
    .map((n) => n.trim())
    .filter(Boolean);
  const duplicate = coders.find((n, i) => coders.indexOf(n) !== i);
  const split = coders.length > 0 ? splitUnits(unitIds, { parts: coders.length, overlapUnits: overlap, shuffle: true, seed }) : null;

  // Unitset names: the coder's name, made unique against the job's unitsets.
  const taken = new Set(unitsets.map((u) => u.name));
  const sets = split ? coders.map((coder, i) => ({ coder, name: unique(coder, taken), unitIds: split.parts[i] })) : [];
  const overlapSet = split && split.overlap.length > 0 ? { name: unique("overlap", taken), unitIds: split.overlap } : null;

  async function create() {
    setError(null);
    setBusy(true);
    try {
      if (overlapSet) await createUnitset.mutateAsync(overlapSet);
      for (const set of sets) {
        const unitset = await createUnitset.mutateAsync({ name: set.name, unitIds: set.unitIds });
        await createInvite.mutateAsync({ label: set.coder, auth: "none", participantId: set.coder, unitsetId: unitset.id });
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4 text-sm">
      <h3 className="font-semibold">Divide units over coders</h3>
      <div className="flex flex-wrap items-start gap-4">
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Units
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value={ALL_UNITS_UNITSET}>All units ({unitsQuery.data?.length ?? 0})</option>
            {unitsets.map((u) => (
              <option key={u.id} value={u.name}>
                {u.name} ({u.unitIds.length})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Coders, one per line
          <Textarea className="w-56 font-normal" rows={5} value={names} onChange={(e) => setNames(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Overlap units (everyone codes them)
          <Input
            type="number"
            min={0}
            className="w-28 font-normal"
            value={overlap}
            onChange={(e) => setOverlap(Math.max(0, Number(e.target.value)))}
          />
        </label>
      </div>
      {split && (
        <p className="text-muted-foreground">
          Creates the unitsets {sets.map((s) => `${s.name} (${s.unitIds.length})`).join(", ")}
          {overlapSet && ` and ${overlapSet.name} (${overlapSet.unitIds.length})`}, shuffled first, and a personal invitation
          per coder whose units are their set. In the codebook, set the unit loop to <em>The invitation&apos;s units</em>
          {overlapSet && (
            <>
              {" "}
              with overlap set <code>{overlapSet.name}</code>
            </>
          )}
          .
        </p>
      )}
      {duplicate && <p className="text-destructive">&quot;{duplicate}&quot; is listed twice.</p>}
      {error && <p className="text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={() => void create()} disabled={!split || unitIds.length === 0 || !!duplicate || busy}>
          {busy ? "Creating..." : `Create ${coders.length} invitations`}
        </Button>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
