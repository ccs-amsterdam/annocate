import { useState, type ReactNode } from "react";
import {
  GOLD_SET,
  OVERLAP_SET,
  PRACTICE_SET,
  SetGroupNameSchema,
  distributeUnits,
  isEmail,
  type SetGroupResponse,
  type SpecialAmount,
} from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useCoderUnitsQuery, usePutSetGroupMutation, useUnitsQuery } from "../../../admin/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/info-tip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Who = "names" | "emails" | "count";

/** A number of special units: a count or a percentage of the units. */
interface Amount {
  value: number;
  percent: boolean;
}
const toAmount = (a: Amount): SpecialAmount => (a.percent ? { fraction: a.value / 100 } : { units: a.value });

/**
 * Makes or updates the set column of the coder unit assignment
 * (docs/architecture.md §6). For specific coders: every unit goes to one or
 * more coders (`coders per unit`), or every coder codes everything; coders
 * are named, their email addresses (they sign in), or numbered (`coder_1`
 * ...). For a crowd: only the special units. Special units for every coder:
 * the overlap (e.g. to compare coders), and optionally practice and gold
 * units (trained or tested on their right answers). With "keep", units a
 * coder was already shown or answered stay theirs first, so dividing again
 * loses no work. The units are shuffled first (seeded); the server stores
 * the column, which the Units page shows and edits like any other.
 * Replacing a column asks first.
 */
export function CoderSetDialog({
  client,
  column: initialColumn,
  groups,
  crowd = false,
  onDone,
}: {
  client: ResearcherApi;
  /** The column to fill (a new one, or one to replace). */
  column: string;
  groups: SetGroupResponse[];
  /** For a crowd: only special units, no coders. */
  crowd?: boolean;
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
  const [who, setWho] = useState<Who>("names");
  const [count, setCount] = useState(3);
  const [text, setText] = useState("");
  const [everyone, setEveryone] = useState(false);
  const [perUnit, setPerUnit] = useState(1);
  const [overlap, setOverlap] = useState<Amount>({ value: 0, percent: true });
  const [practice, setPractice] = useState<Amount | null>(null);
  const [gold, setGold] = useState<Amount | null>(null);
  const [seed] = useState(() => Math.floor(Math.random() * 1_000_000));

  const listed = text
    .split(/[\n,;]+/)
    .map((n) => n.trim())
    .filter(Boolean);
  const names = crowd ? [] : who === "count" ? Array.from({ length: count }, (_, i) => `coder_${i + 1}`) : listed;
  const notEmails = who === "emails" ? names.filter((n) => !isEmail(n)) : [];
  const twice = names.find((n, j) => names.findIndex((m) => m.toLowerCase() === n.toLowerCase()) !== j);
  const validName = SetGroupNameSchema.safeParse(column).success;
  const existing = groups.find((g) => g.name === column);

  // Units coders of these names already saw (also under another column's name: the coder id is what counts)
  const keepMap = new Map(seen.filter((c) => names.includes(c.coder)).map((c) => [c.coder, c.unitIds]));
  const overlapOption = overlap.percent ? { overlapFraction: overlap.value / 100 } : { overlapUnits: overlap.value };
  const { sets, kept } =
    names.length > 0 || crowd
      ? distributeUnits(unitIds, names, {
          perUnit: everyone ? names.length : perUnit,
          seed,
          ...overlapOption,
          ...(practice ? { practice: toAmount(practice) } : {}),
          ...(gold ? { gold: toAmount(gold) } : {}),
          keep: keep ? keepMap : undefined,
        })
      : { sets: [], kept: 0 };
  const sizeOf = (set: string) => sets.find((s) => s.name === set)?.units.length ?? 0;
  const special = [
    [OVERLAP_SET, "overlap"],
    [PRACTICE_SET, "practice"],
    [GOLD_SET, "gold"],
  ]
    .filter(([set]) => sizeOf(set) > 0)
    .map(([set, label]) => `${sizeOf(set)} ${label}`);
  const perCoder = sets.filter((s) => !s.name.startsWith("_")).map((s) => s.units.length);
  const problem = !validName
    ? "A column's name is letters, digits and _, starting with a letter."
    : !crowd && names.length === 0
      ? "Give at least one coder."
      : twice
        ? `${twice} is listed twice.`
        : notEmails.length > 0
          ? `Not an email address: ${notEmails.slice(0, 3).join(", ")}${notEmails.length > 3 ? ", …" : ""}`
          : unitIds.length === 0
            ? "The study has no units yet: upload them first."
            : crowd && special.length === 0
              ? "Choose some special units: a crowd's column only holds those."
              : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onDone(null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {crowd
              ? existing
                ? "Update the special units"
                : "New column with special units"
              : existing
                ? "Update the coder distribution"
                : "New coder distribution"}
          </DialogTitle>
          <DialogDescription>
            {crowd
              ? `Marks some of the ${unitIds.length} units as special units for every coder, as a set column of the units. The crowd divides or codes the rest.`
              : `Divides the ${unitIds.length} units over your coders, as a set column of the units.`}{" "}
            You can edit it later on the Units page.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          {!crowd && (
            <>
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-xs font-semibold">Coders</legend>
                {(
                  [
                    ["names", "Names, each with their own link"],
                    ["emails", "Email addresses: coders sign in, one link for all"],
                    ["count", "A number of coders (coder_1, coder_2, …), each with their own link"],
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
            </>
          )}
          <div className="flex flex-wrap items-end justify-between gap-4">
            {!crowd ? (
              <div className="flex flex-col gap-1 text-xs font-semibold">
                Coders per unit
                <div className="flex items-center gap-2">
                  <select
                    aria-label="How the units go to coders"
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs font-normal"
                    value={everyone ? "everyone" : "divide"}
                    onChange={(e) => setEveryone(e.target.value === "everyone")}
                  >
                    <option value="divide">Divide the units</option>
                    <option value="everyone">Everyone codes everything</option>
                  </select>
                  {!everyone && (
                    <Input
                      type="number"
                      aria-label="Coders per unit"
                      min={1}
                      max={Math.max(1, names.length)}
                      className="h-8 w-20 text-xs font-normal"
                      value={perUnit}
                      onChange={(e) => setPerUnit(Math.max(1, Number(e.target.value)))}
                    />
                  )}
                </div>
              </div>
            ) : (
              <span />
            )}
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
          <section className="flex flex-col gap-2 rounded-md border border-border p-3">
            <h3 className="flex items-center gap-1 text-xs font-semibold">
              Special units
              <InfoTip label="About special units">
                Units every coder gets, besides their own. Overlap units are for comparing coders (agreement). Practice
                and gold units work just like overlap units, but are meant to train or test coders on the
                &quot;correct&quot; answers for these units: practice units give feedback, gold units are checked
                without coders noticing.
              </InfoTip>
            </h3>
            <AmountRow label="Overlap units" amount={overlap} onChange={setOverlap} />
            <ToggleAmount label="Practice units" amount={practice} onChange={setPractice} />
            <ToggleAmount label="Gold units" amount={gold} onChange={setGold} />
            {(practice || gold) && (
              <p className="rounded-md bg-amber-500/10 p-2 text-[11px] text-amber-800 dark:text-amber-300">
                {practice && gold
                  ? "Practice and gold units need"
                  : practice
                    ? "Practice units need"
                    : "Gold units need"}{" "}
                their correct answers: for each question to check, a column of the units named{" "}
                {practice && <span className="font-mono">&lt;question&gt;_practice</span>}
                {practice && gold && " or "}
                {gold && <span className="font-mono">&lt;question&gt;_gold</span>}. Add them to your units file and
                upload it again, or fill them in on the Units page (Right answers). Then choose the questions to check
                in the unit loop&apos;s Units settings.
              </p>
            )}
          </section>
          {!problem && (
            <p className="text-xs text-muted-foreground">
              {crowd
                ? `Special units: ${special.join(", ")}.`
                : `${names.length} coder${names.length === 1 ? "" : "s"}, each with ${everyone ? "" : "about "}${Math.round(
                    perCoder.reduce((a, b) => a + b, 0) / Math.max(1, perCoder.length),
                  )} units${special.length > 0 ? `, plus ${special.join(", ")} units for everyone` : ""}.`}{" "}
              Units are shuffled first.
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
                      { onSuccess: () => onDone({ column, emails: who === "emails" && !crowd }) },
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

/** A number of special units: a count, or a percentage of the units. */
function AmountRow({
  label,
  lead,
  amount,
  onChange,
}: {
  label: string;
  /** Before the label (a toggle's checkbox; else its room, so the rows line up). */
  lead?: ReactNode;
  amount: Amount;
  onChange: (a: Amount) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="flex w-32 items-center gap-2 font-semibold">
        {lead ?? <span className="w-[13px]" />}
        {label}
      </span>
      <Input
        type="number"
        aria-label={label}
        min={0}
        className="h-8 w-20 text-xs"
        value={amount.value}
        onChange={(e) => onChange({ ...amount, value: Math.max(0, Number(e.target.value)) })}
      />
      <select
        aria-label={`${label}: unit`}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        value={amount.percent ? "pct" : "n"}
        onChange={(e) => onChange({ ...amount, percent: e.target.value === "pct" })}
      >
        <option value="pct">%</option>
        <option value="n">units</option>
      </select>
    </div>
  );
}

/** Practice or gold units: off, or a number of them. */
function ToggleAmount({
  label,
  amount,
  onChange,
}: {
  label: string;
  amount: Amount | null;
  onChange: (a: Amount | null) => void;
}) {
  return amount ? (
    <AmountRow
      label={label}
      lead={<input type="checkbox" aria-label={label} checked onChange={() => onChange(null)} />}
      amount={amount}
      onChange={onChange}
    />
  ) : (
    <label className="flex items-center gap-2 text-xs font-semibold">
      <input type="checkbox" checked={false} onChange={() => onChange({ value: 5, percent: false })} />
      {label}
    </label>
  );
}
