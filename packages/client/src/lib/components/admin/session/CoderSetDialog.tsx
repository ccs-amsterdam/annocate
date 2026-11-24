import { useState } from "react";
import {
  CODER_SET,
  TEST_SET,
  TEST_SET_TYPES,
  distributeUnits,
  isEmail,
  type SetGroupResponse,
  type TestSetType,
} from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import {
  useCoderUnitsQuery,
  useDeleteSetGroupMutation,
  usePutSetGroupMutation,
  useUnitsQuery,
} from "../../../admin/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/info-tip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TEST_LABELS, assignWithoutValue, testSetsOf, unitsWithoutValue } from "../../../admin/setKinds";
import { AssignModeChoice, type AssignMode } from "../units/AssignMode";

type Who = "names" | "emails" | "count";

/**
 * Makes or updates the units' `coder_set` (who codes which units, specific
 * coders; docs/plans/unit-sets.md): every unit goes to one or more coders
 * (`coders per unit`), or every coder codes everything; coders are named,
 * their email addresses (they sign in), or numbered (`coder_1` ...). Test
 * units (`test_set`: overlap, practice, gold) are everyone's, not divided:
 * an existing `test_set` column is kept; with "Redistribute test units",
 * that many units of each type are drawn anew. With "keep", units a coder
 * already coded stay theirs first, so dividing again loses no work (units
 * they were only sent are divided again). The units are shuffled first (seeded); the Units page shows and
 * edits the columns. Replacing the coder set asks first; or it keeps the
 * coder set and gives the units without a coder (not test units) to its
 * coders.
 */
export function CoderSetDialog({
  client,
  groups,
  onDone,
}: {
  client: ResearcherApi;
  groups: SetGroupResponse[];
  /** Done (null: cancelled), and whether the coders are email addresses. */
  onDone: (result: { emails: boolean } | null) => void;
}) {
  const unitsQuery = useUnitsQuery(client);
  const putGroup = usePutSetGroupMutation(client);
  const deleteGroup = useDeleteSetGroupMutation(client);
  const unitIds = (unitsQuery.data ?? []).map((u) => u.id);
  const seen = useCoderUnitsQuery(client).data?.coders ?? [];
  const existing = groups.find((g) => g.name === CODER_SET);
  const existingTests = groups.find((g) => g.name === TEST_SET);
  const currentTests = Object.fromEntries(
    TEST_SET_TYPES.map((t) => [t, existingTests?.sets.find((s) => s.name === t)?.unitIds.length ?? 0]),
  ) as Record<TestSetType, number>;
  const [mode, setMode] = useState<AssignMode>("anew");
  const empty = existing ? unitsWithoutValue(unitIds, groups, CODER_SET) : [];
  const assigning = existing !== undefined && mode === "empty";
  const [keep, setKeep] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [who, setWho] = useState<Who>("names");
  const [count, setCount] = useState(3);
  const [text, setText] = useState("");
  const [everyone, setEveryone] = useState(false);
  const [perUnit, setPerUnit] = useState(1);
  const [redistribute, setRedistribute] = useState(false);
  const [testCounts, setTestCounts] = useState<Record<TestSetType, number>>(currentTests);
  const [seed] = useState(() => Math.floor(Math.random() * 1_000_000));

  const listed = text
    .split(/[\n,;]+/)
    .map((n) => n.trim())
    .filter(Boolean);
  const names = assigning
    ? existing.sets.map((s) => s.name)
    : who === "count"
      ? Array.from({ length: count }, (_, i) => `coder_${i + 1}`)
      : listed;
  const notEmails = who === "emails" ? names.filter((n) => !isEmail(n)) : [];
  const twice = names.find((n, j) => names.findIndex((m) => m.toLowerCase() === n.toLowerCase()) !== j);

  // Units coders of these names already saw (the coder id is what counts)
  const keepMap = new Map(
    seen.filter((c) => names.includes(c.coder) && c.coded.length > 0).map((c) => [c.coder, c.coded]),
  );
  const { sets, testUnits, kept } =
    names.length > 0
      ? distributeUnits(unitIds, names, {
          perUnit: everyone ? names.length : perUnit,
          seed,
          ...(redistribute
            ? { newTestUnits: testCounts }
            : { testUnits: existingTests?.sets.flatMap((s) => s.unitIds) ?? [] }),
          keep: keep ? keepMap : undefined,
        })
      : { sets: [], testUnits: [], kept: 0 };
  const shownTests = redistribute ? testCounts : currentTests;
  const tests = TEST_SET_TYPES.filter((t) => shownTests[t] > 0).map((t) => `${shownTests[t]} ${t}`);
  const perCoder = sets.map((s) => s.units.length);
  const testTotal = TEST_SET_TYPES.reduce((n, t) => n + testCounts[t], 0);
  const assigned = assigning
    ? assignWithoutValue(CODER_SET, existing.sets, empty, { perUnit: everyone ? names.length : perUnit, seed })
    : [];
  const problem = assigning
    ? empty.length === 0
      ? "Every unit has a coder or is a test unit."
      : null
    : names.length === 0
      ? "Give at least one coder."
      : twice
        ? `${twice} is listed twice.`
        : notEmails.length > 0
          ? `Not an email address: ${notEmails.slice(0, 3).join(", ")}${notEmails.length > 3 ? ", …" : ""}`
          : unitIds.length === 0
            ? "The study has no units yet: upload them first."
            : redistribute && testTotal >= unitIds.length
              ? `There are ${unitIds.length} units: leave some for the coders.`
              : null;

  async function save() {
    setSaving(true);
    try {
      await putGroup.mutateAsync({
        group: CODER_SET,
        body: { sets: assigning ? assigned : sets.map((s) => ({ name: s.name, unitIds: s.units, ordered: false })) },
      });
      if (redistribute && !assigning) {
        if (testUnits.length > 0)
          await putGroup.mutateAsync({ group: TEST_SET, body: { sets: testSetsOf(testUnits) } });
        else if (existingTests) await deleteGroup.mutateAsync(TEST_SET);
      }
      onDone({ emails: who === "emails" });
    } catch {
      // Shown below (the mutation's error)
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onDone(null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Update the coder set" : "New coder set"}</DialogTitle>
          <DialogDescription>
            Divides the {unitIds.length} units over your coders, as the units&apos; coder set (
            <span className="font-mono">coder_set</span>). You can edit it later on the Units page.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          {existing && <AssignModeChoice label="coder set" mode={mode} empty={empty.length} onChange={setMode} />}
          {!assigning && (
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
          )}
          {assigning ? null : who === "count" ? (
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
          {!assigning && (
            <section className="flex flex-col gap-2 rounded-md border border-border p-3">
              <h3 className="flex items-center gap-1 text-xs font-semibold">
                Test units
                <InfoTip label="About test units">
                  Units every coder gets, besides their own (the units&apos; <span className="font-mono">test_set</span>
                  ). Overlap units are for comparing coders (agreement). Practice and gold units are meant to train or
                  test coders on the &quot;correct&quot; answers for these units: practice units give feedback, gold
                  units are checked without coders noticing.
                </InfoTip>
              </h3>
              {TEST_SET_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-2 text-xs">
                  <span className="w-32 font-semibold">{TEST_LABELS[type]}</span>
                  <Input
                    type="number"
                    aria-label={TEST_LABELS[type]}
                    min={0}
                    disabled={!redistribute}
                    className="h-8 w-20 text-xs"
                    value={redistribute ? testCounts[type] : currentTests[type]}
                    onChange={(e) =>
                      setTestCounts({ ...testCounts, [type]: Math.max(0, Math.floor(Number(e.target.value))) })
                    }
                  />
                  units
                </label>
              ))}
              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={redistribute}
                  onChange={(e) => {
                    setRedistribute(e.target.checked);
                    setTestCounts(currentTests);
                  }}
                />
                <span>
                  Redistribute test units
                  <span className="block text-muted-foreground">
                    {redistribute
                      ? "Draws this many units of each type anew (at random), replacing the current test units."
                      : existingTests
                        ? "The current test units stay; the coders divide the other units."
                        : "No test units yet: switch this on to draw some."}
                  </span>
                </span>
              </label>
              {redistribute && testCounts.practice + testCounts.gold > 0 && (
                <p className="rounded-md bg-amber-500/10 p-2 text-[11px] text-amber-800 dark:text-amber-300">
                  Practice and gold units need their correct answers: for each question to check, a column of the units
                  named <span className="font-mono">answer_&lt;question&gt;</span>. Add them to your units file and
                  upload it again, or write them in the unit loop&apos;s Units settings (Create gold values). Then
                  choose the questions to check there.
                </p>
              )}
            </section>
          )}
          {!problem && assigning && (
            <p className="text-xs text-muted-foreground">
              {`Gives the ${empty.length} unit${empty.length === 1 ? "" : "s"} without a coder to the ${names.length} coder${names.length === 1 ? "" : "s"} (${names.slice(0, 5).join(", ")}${names.length > 5 ? ", …" : ""}), those with the fewest units first. Current assignments stay.`}
            </p>
          )}
          {!problem && !assigning && (
            <p className="text-xs text-muted-foreground">
              {`${names.length} coder${names.length === 1 ? "" : "s"}, each with ${everyone ? "" : "about "}${Math.round(
                perCoder.reduce((a, b) => a + b, 0) / Math.max(1, perCoder.length),
              )} units${tests.length > 0 ? `, plus ${tests.join(", ")} test units for everyone` : ""}.`}{" "}
              Units are shuffled first.
            </p>
          )}
          {keepMap.size > 0 && !assigning && (
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" className="mt-0.5" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
              <span>
                Keep the units coders already coded ({[...keepMap.values()].reduce((n, u) => n + u.length, 0)} units, by{" "}
                {keepMap.size} of these coders)
                <span className="block text-muted-foreground">
                  A coder who already coded units keeps those, so nobody loses work or codes a unit twice; the rest is
                  divided as usual.
                  {keep && kept > 0 ? ` ${kept} unit assignments are kept.` : ""}
                </span>
              </span>
            </label>
          )}
          {problem && <p className="text-xs text-destructive">{problem}</p>}
          {putGroup.isError && <p className="text-xs text-destructive">{putGroup.error.message}</p>}
          {deleteGroup.isError && <p className="text-xs text-destructive">{deleteGroup.error.message}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onDone(null)}>
              Cancel
            </Button>
            {confirming && existing && !assigning && (
              <span className="mr-auto self-center text-xs text-amber-700 dark:text-amber-400">
                The coder set exists ({existing.sets.length} coders): overwrite it?
              </span>
            )}
            <Button
              disabled={problem !== null || saving}
              onClick={() => (existing && !assigning && !confirming ? setConfirming(true) : void save())}
            >
              {saving
                ? "Making…"
                : assigning
                  ? `Assign ${empty.length} unit${empty.length === 1 ? "" : "s"}`
                  : confirming && existing
                    ? "Overwrite"
                    : "Make the coder set"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
