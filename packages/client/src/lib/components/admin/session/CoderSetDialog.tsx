import { useState } from "react";
import {
  OVERLAP_SET,
  SetGroupNameSchema,
  distributeUnits,
  isEmail,
  type SetGroupResponse,
} from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useCoderUnitsQuery, usePutSetGroupMutation, useUnitsQuery } from "../../../admin/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Who = "count" | "names" | "emails";

/**
 * Makes or updates a coder distribution: a set column of the units
 * (docs/architecture.md §6). Every unit goes to one or more coders (`coders
 * per unit`), and some units (the overlap) to every coder, e.g. to compare
 * coders. Coders are numbered (`coder_1` ...), named, or their email
 * addresses (they sign in). With "keep", units a coder was already shown or
 * answered stay theirs first, so dividing again loses no work. The units are
 * shuffled first (seeded); the server stores the column, which the Units
 * page shows and edits like any other. Replacing a column asks first.
 */
export function CoderSetDialog({
  client,
  column: initialColumn,
  groups,
  onDone,
}: {
  client: ResearcherApi;
  /** The column to fill (a new one, or one to replace). */
  column: string;
  groups: SetGroupResponse[];
  /** Done: the column made (null: cancelled), and whether its coders are email addresses. */
  onDone: (result: { column: string; emails: boolean } | null) => void;
}) {
  const unitsQuery = useUnitsQuery(client);
  const putGroup = usePutSetGroupMutation(client);
  const unitIds = (unitsQuery.data ?? []).map((u) => u.id);
  const seen = useCoderUnitsQuery(client).data?.coders ?? [];
  const [keep, setKeep] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [column, setColumn] = useState(initialColumn);
  const [who, setWho] = useState<Who>("count");
  const [count, setCount] = useState(3);
  const [text, setText] = useState("");
  const [perUnit, setPerUnit] = useState(1);
  const [overlap, setOverlap] = useState(0);
  const [overlapIsPercent, setOverlapIsPercent] = useState(true);
  const [seed] = useState(() => Math.floor(Math.random() * 1_000_000));

  const listed = text
    .split(/[\n,;]+/)
    .map((n) => n.trim())
    .filter(Boolean);
  const names = who === "count" ? Array.from({ length: count }, (_, i) => `coder_${i + 1}`) : listed;
  const notEmails = who === "emails" ? names.filter((n) => !isEmail(n)) : [];
  const twice = names.find((n, j) => names.findIndex((m) => m.toLowerCase() === n.toLowerCase()) !== j);
  const validName = SetGroupNameSchema.safeParse(column).success;
  const existing = groups.find((g) => g.name === column);

  const overlapOption = overlapIsPercent ? { overlapFraction: overlap / 100 } : { overlapUnits: overlap };
  // Units coders of these names already saw (also under another column's name: the coder id is what counts)
  const keepMap = new Map(seen.filter((c) => names.includes(c.coder)).map((c) => [c.coder, c.unitIds]));
  const { sets, kept } =
    names.length > 0
      ? distributeUnits(unitIds, names, { perUnit, seed, ...overlapOption, keep: keep ? keepMap : undefined })
      : { sets: [], kept: 0 };
  const overlapUnits = sets.find((s) => s.name === OVERLAP_SET)?.units.length ?? 0;
  const perCoder = sets.filter((s) => s.name !== OVERLAP_SET).map((s) => s.units.length);
  const problem = !validName
    ? "A column's name is letters, digits and _, starting with a letter."
    : names.length === 0
      ? "Give at least one coder."
      : twice
        ? `${twice} is listed twice.`
        : notEmails.length > 0
          ? `Not an email address: ${notEmails.slice(0, 3).join(", ")}${notEmails.length > 3 ? ", …" : ""}`
          : unitIds.length === 0
            ? "The study has no units yet: upload them first."
            : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onDone(null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Update the coder distribution" : "New coder distribution"}</DialogTitle>
          <DialogDescription>
            Divides the {unitIds.length} units over your coders, as a set column of the units. You can edit it later on
            the Units page.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-xs font-semibold">Coders</legend>
            {(
              [
                ["count", "A number of coders (coder_1, coder_2, …), each with their own link"],
                ["names", "Names, each with their own link"],
                ["emails", "Email addresses: coders sign in, one link for all"],
              ] as [Who, string][]
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-xs">
                <input type="radio" name="who" checked={who === value} onChange={() => setWho(value)} />
                {label}
              </label>
            ))}
          </fieldset>
          {who === "count" ? (
            <label className="flex items-center gap-2 text-xs font-semibold">
              Number of coders
              <Input
                type="number"
                min={1}
                max={500}
                className="h-8 w-20 text-xs font-normal"
                value={count}
                onChange={(e) => setCount(Math.min(500, Math.max(1, Number(e.target.value))))}
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-xs font-semibold">
              {who === "emails" ? "Email addresses" : "Names"} (one per line)
              <textarea
                className="min-h-20 rounded-md border border-input bg-background px-2 py-1 font-mono text-xs font-normal"
                value={text}
                placeholder={who === "emails" ? "anna@uni.nl\nbob@uni.nl" : "anna\nbob\ncarla"}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
          )}
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Coders per unit
              <Input
                type="number"
                min={1}
                max={Math.max(1, names.length)}
                className="h-8 w-20 text-xs font-normal"
                value={perUnit}
                onChange={(e) => setPerUnit(Math.max(1, Number(e.target.value)))}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Overlap: units for every coder
              <div className="flex gap-1">
                <Input
                  type="number"
                  min={0}
                  className="h-8 w-20 text-xs font-normal"
                  value={overlap}
                  onChange={(e) => setOverlap(Math.max(0, Number(e.target.value)))}
                />
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs font-normal"
                  value={overlapIsPercent ? "pct" : "n"}
                  onChange={(e) => setOverlapIsPercent(e.target.value === "pct")}
                >
                  <option value="pct">%</option>
                  <option value="n">units</option>
                </select>
              </div>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Column name
              <Input
                className="h-8 w-32 font-mono text-xs font-normal"
                value={column}
                onChange={(e) => {
                  setColumn(e.target.value);
                  setConfirming(false);
                }}
              />
            </label>
          </div>
          {!problem && (
            <p className="text-xs text-muted-foreground">
              {names.length} coder{names.length === 1 ? "" : "s"}, each with about{" "}
              {Math.round(perCoder.reduce((a, b) => a + b, 0) / Math.max(1, perCoder.length))} units
              {overlapUnits > 0 ? `, plus ${overlapUnits} overlap units for everyone` : ""}. Units are shuffled first.
            </p>
          )}
          {keepMap.size > 0 && (
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" className="mt-0.5" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
              <span>
                Keep the units coders already have ({[...keepMap.values()].reduce((n, u) => n + u.length, 0)} units
                shown to {keepMap.size} of these coders)
                <span className="block text-muted-foreground">
                  A coder who already saw units gets those first, so nobody loses work; the rest is divided as usual.
                  {keep && kept > 0 ? ` ${kept} unit assignments are kept.` : ""}
                </span>
              </span>
            </label>
          )}
          {problem && <p className="text-xs text-destructive">{problem}</p>}
          {putGroup.isError && <p className="text-xs text-destructive">{putGroup.error.message}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onDone(null)}>
              Cancel
            </Button>
            {confirming && existing && (
              <span className="mr-auto self-center text-xs text-amber-700 dark:text-amber-400">
                Column {column} exists ({existing.sets.length} values): overwrite it?
              </span>
            )}
            <Button
              disabled={problem !== null || putGroup.isPending}
              onClick={() =>
                existing && !confirming
                  ? setConfirming(true)
                  : putGroup.mutate(
                      {
                        group: column,
                        body: { sets: sets.map((s) => ({ name: s.name, unitIds: s.units, ordered: false })) },
                      },
                      { onSuccess: () => onDone({ column, emails: who === "emails" }) },
                    )
              }
            >
              {putGroup.isPending ? "Making…" : confirming && existing ? "Overwrite" : "Make the column"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
