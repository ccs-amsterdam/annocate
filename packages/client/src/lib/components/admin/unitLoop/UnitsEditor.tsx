import {
  CODER_SET,
  PART_SET,
  TEST_UNIT,
  type Criteria,
  type DesignIssue,
  type SetGroupResponse,
  type LoopUnits,
  type TestUnitType,
} from "@annotinder/contracts";
import { cn } from "cn";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/info-tip";
import { IssueList } from "../IssueList";
import { HelpButton } from "../../../help/HelpButton";
import { shareSummary, type LoopUnitsContext } from "../../../design/assignment";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { type AnswerKeyQuestion } from "../units/AnswerKeyDialog";
import { MakeSetColumnButton } from "../units/SplitIntoSets";
import { selectClass, labelClass, type AnswerKeyContext, numberOrUndefined, range } from "./helpers";
import { GoldChecks, PlacementRow, PracticeChecks } from "./SpecialUnits";

// A unit loop's units settings (contracts `LoopUnitsSchema`), within the
// coder's units (who the coders are is the coder unit assignment's): an
// earlier loop's units or one part of the study (`part_set`), for a crowd
// whether they are divided among the coders, and the coding and test units
// (`test_unit`: where they go); with the checks on practice and gold units.

/** A loop's units: which units, dividing them, the coding and test units and their checks. */
export function UnitsEditor({
  units: settings,
  groups,
  checkable,
  agreeable,
  answerKey,
  screenouts,
  context,
  issues,
  client,
  onChange,
}: {
  units: LoopUnits;
  context: LoopUnitsContext;
  answerKey?: AnswerKeyContext;
  groups: SetGroupResponse[];
  checkable: AnswerKeyQuestion[];
  /** The loop's questions an agreement rule can use. */
  agreeable: string[];
  screenouts: string[];
  issues: DesignIssue[];
  /** To make a part set (absent: not offered). */
  client?: ResearcherApi;
  onChange: (units: LoopUnits) => void;
}) {
  const { invite, earlier } = context;
  const tests = groups.find((g) => g.name === TEST_UNIT);
  const count = (type: TestUnitType) => tests?.sets.find((s) => s.name === type)?.unitIds.length ?? 0;
  const set = <K extends keyof LoopUnits>(key: K, value: LoopUnits[K] | undefined) => {
    const next = { ...settings, [key]: value };
    if (value === undefined) delete next[key];
    onChange(next);
  };
  const sameAs = settings.sameAsPrevious ? true : undefined;
  const previous = earlier[earlier.length - 1];
  const shows = (kind: "practice" | "gold", check: unknown) =>
    settings[kind] !== "ignore" && (count(kind) > 0 || check !== undefined);
  // Specific coders: the units in the coder set; otherwise all units (test units aside)
  const coders = invite.mode === "coders" ? groups.find((g) => g.name === CODER_SET) : undefined;
  const codingCount = coders ? new Set(coders.sets.flatMap((s) => s.unitIds)).size : null;
  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-1 text-xs">
        <span>{shareSummary(context.sources, settings.part)}</span>
        <HelpButton topic="unit-distribution" label="Help: unit distribution" />
      </p>
      {(previous || sameAs) && (
        <label className={labelClass}>
          Coding units
          <select
            className={`${selectClass} w-fit font-normal`}
            value={sameAs ? "previous" : ""}
            onChange={(e) => {
              const next: LoopUnits = { ...settings, sameAsPrevious: true };
              if (e.target.value !== "previous") delete next.sameAsPrevious;
              else {
                // The previous loop's units: not selected or divided again here
                delete next.part;
                delete next.divide;
              }
              onChange(next);
            }}
          >
            <option value="">Selected for this loop</option>
            <option value="previous">
              The units each coder got in the previous loop{previous ? ` (${previous.title})` : ""}
            </option>
          </select>
        </label>
      )}
      {sameAs === undefined && (
        <PartEditor groups={groups} part={settings.part} client={client} onChange={(part) => set("part", part)} />
      )}
      {/* For a crowd; shown for specific coders only to undo a leftover divide (an error there) */}
      {(invite.mode === "crowd" || settings.divide) && sameAs === undefined && (
        <Divide criteria={settings.divide} agreeable={agreeable} onChange={(divide) => set("divide", divide)} />
      )}
      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-1 text-xs font-semibold">
          Coding and test units
          <span className="font-normal text-muted-foreground">
            (test units: the units&apos; <span className="font-mono">test_unit</span>)
          </span>
        </h3>
        <div className="grid w-fit grid-cols-[auto_2.5rem_auto] items-center gap-x-3 gap-y-1.5">
          <span className="text-xs font-semibold">Coding units</span>
          <span
            className="text-right font-mono text-[11px] text-muted-foreground"
            title={coders ? "Units in the coder set" : "The units that aren't test units"}
          >
            {codingCount ?? "all"}
          </span>
          <select
            className={`${selectClass} w-fit font-normal`}
            aria-label="Coding units"
            value={settings.coding === false ? "no" : "yes"}
            onChange={(e) => set("coding", e.target.value === "no" ? false : undefined)}
          >
            <option value="yes">Include</option>
            <option value="no">Leave out (only test units)</option>
          </select>
          <PlacementRow
            label="Overlap units"
            help="overlap"
            count={count("overlap")}
            value={settings.overlap}
            onChange={(p) => set("overlap", p === "spread" ? undefined : p)}
          />
          <PlacementRow
            label="Practice units"
            count={count("practice")}
            value={settings.practice}
            onChange={(p) => set("practice", p === "spread" ? undefined : p)}
          />
          <PlacementRow
            label="Gold units"
            help="special-units"
            count={count("gold")}
            value={settings.gold}
            onChange={(p) => set("gold", p === "spread" ? undefined : p)}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          {tests
            ? "Spread throughout a divided crowd's units without a maximum of units per coder: about one in ten."
            : "The units have no test units (test_unit) yet: mark them on the Units page, or with the coder set dialog."}
        </p>
      </section>
      {shows("practice", settings.practiceCheck) && (
        <PracticeChecks
          check={settings.practiceCheck}
          checkable={checkable}
          answerKey={answerKey}
          onChange={(check) => set("practiceCheck", check)}
        />
      )}
      {shows("gold", settings.goldCheck) && (
        <GoldChecks
          check={settings.goldCheck}
          checkable={checkable}
          answerKey={answerKey}
          screenouts={screenouts}
          onChange={(check) => set("goldCheck", check)}
        />
      )}
      <IssueList issues={issues} />
    </div>
  );
}

/**
 * A loop's part (`units.part`): one value of the units' `part_set`; none,
 * all units. Without a part set, an offer to make one.
 */
function PartEditor({
  groups,
  part,
  client,
  onChange,
}: {
  groups: SetGroupResponse[];
  part: string | undefined;
  client?: ResearcherApi;
  onChange: (part: string | undefined) => void;
}) {
  const parts = groups.find((g) => g.name === PART_SET);
  const known = part === undefined || parts?.sets.some((s) => s.name === part);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className={labelClass}>
        <span className="flex items-center gap-1">
          Part
          <InfoTip label="About parts">
            Code only one part of the units in this loop: those with this value in the units&apos;{" "}
            <span className="font-mono">part_set</span> (e.g. <span className="font-mono">pre</span> and{" "}
            <span className="font-mono">post</span>, a loop each). Test units without a part are in every loop.
          </InfoTip>
        </span>
        <select
          aria-label="Part"
          className={cn(selectClass, "w-fit font-normal", !known && "border-destructive")}
          value={part ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">All units</option>
          {part !== undefined && !known && <option value={part}>{part} (not in part_set)</option>}
          {(parts?.sets ?? []).map((s) => (
            <option key={s.name} value={s.name}>
              {s.name} ({s.unitIds.length})
            </option>
          ))}
        </select>
      </label>
      {!parts && client && (
        <MakeSetColumnButton client={client} column={PART_SET} groups={groups}>
          Make a part set…
        </MakeSetColumnButton>
      )}
      {!parts && (
        <span className="pb-2 text-[11px] text-muted-foreground">The units have no part set (part_set) yet.</span>
      )}
    </div>
  );
}

/** A crowd's loop: every coder codes all units, or they are divided among the coders (a shared queue). */
function Divide({
  criteria,
  agreeable,
  onChange,
}: {
  criteria: Criteria | undefined;
  agreeable: string[];
  onChange: (criteria: Criteria | undefined) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 flex items-center gap-1 text-xs font-semibold">
        Units and coders
        <HelpButton topic="shared-queues" label="Help: dividing units" />
      </legend>
      <label className="flex items-center gap-2 text-xs">
        <input type="radio" checked={criteria === undefined} onChange={() => onChange(undefined)} />
        Everyone codes everything
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="radio"
          checked={criteria !== undefined}
          onChange={() => criteria === undefined && onChange({ codersPerUnit: { min: 1 } })}
        />
        Divide units among coders
        <InfoTip label="About dividing units">
          The units are handed out until each has enough coders: coders get the units that still need them.
        </InfoTip>
      </label>
      {criteria && (
        <div className="mt-1 rounded-md border border-border p-3">
          <SharedSettings
            criteria={criteria}
            agreeable={agreeable}
            allowAgreement={agreeable.length > 0 || criteria.until !== undefined}
            onChange={onChange}
          />
        </div>
      )}
    </fieldset>
  );
}

/**
 * A shared queue's numbers (contracts Criteria) as a small grid: units per
 * coder (min, max), and coders per unit or agreement per unit.
 */
export function SharedSettings({
  criteria,
  agreeable,
  onChange,
  allowAgreement = true,
}: {
  criteria: Criteria;
  agreeable: string[];
  onChange: (c: Criteria) => void;
  /** Offer "agreement per unit" (not in the setup wizard: it needs a question with options). */
  allowAgreement?: boolean;
}) {
  const until = criteria.until;
  const needed = until ? until.agree : (criteria.codersPerUnit?.min ?? 1);
  const maxCoders = criteria.codersPerUnit?.max;
  const numberInput = "h-8 w-full text-xs";
  const set = (next: Partial<Criteria>) => {
    const merged: Criteria = { ...criteria, ...next };
    for (const key of Object.keys(merged) as (keyof Criteria)[]) if (merged[key] === undefined) delete merged[key];
    onChange(merged);
  };
  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="grid grid-cols-[auto_5.5rem_5.5rem_1fr] items-center gap-x-2 gap-y-1.5">
        <span />
        <span className="font-semibold text-muted-foreground">at least</span>
        <span className="font-semibold text-muted-foreground">at most</span>
        <span />

        <span className="font-semibold">Units per coder</span>
        <Input
          type="number"
          min={1}
          className={numberInput}
          aria-label="Min units per coder"
          title="While a coder has fewer, they also get units past the most coders per unit, as long as coders don't agree on them yet"
          value={criteria.unitsPerCoder?.min ?? ""}
          placeholder="none"
          onChange={(e) =>
            set({ unitsPerCoder: range(numberOrUndefined(e.target.value), criteria.unitsPerCoder?.max) })
          }
        />
        <Input
          type="number"
          min={1}
          className={numberInput}
          aria-label="Max units per coder"
          value={criteria.unitsPerCoder?.max ?? ""}
          placeholder="no limit"
          onChange={(e) =>
            set({ unitsPerCoder: range(criteria.unitsPerCoder?.min, numberOrUndefined(e.target.value)) })
          }
        />
        <span />

        {!allowAgreement ? (
          <span className="font-semibold">Coders per unit</span>
        ) : (
          <select
            className={selectClass}
            aria-label="Each unit is coded until"
            value={until ? "agree" : "coders"}
            onChange={(e) => {
              const n = Math.max(2, needed);
              if (e.target.value === "agree") {
                // Agreement needs room for disagreement: at most is above the agreeing coders
                set({
                  until: { agree: n, on: agreeable[0] ?? "" },
                  codersPerUnit: { max: maxCoders === undefined || maxCoders < n ? Math.max(3, n + 1) : maxCoders },
                });
              } else set({ until: undefined, codersPerUnit: range(needed, maxCoders) });
            }}
          >
            <option value="coders">Coders per unit</option>
            <option value="agree">Agreement per unit</option>
          </select>
        )}
        <Input
          type="number"
          min={until ? 2 : 1}
          className={numberInput}
          aria-label={until ? "Coders who must agree" : "Coders per unit"}
          value={needed}
          onChange={(e) => {
            const n = Number(e.target.value) || 1;
            // The most coders can't be below the number needed: it follows upwards.
            const max = maxCoders !== undefined && maxCoders < n ? n : maxCoders;
            if (until) set({ until: { ...until, agree: n }, codersPerUnit: range(undefined, max) });
            else set({ codersPerUnit: range(n, max) });
          }}
        />
        <Input
          type="number"
          min={1}
          className={numberInput}
          aria-label="Max coders per unit"
          value={maxCoders ?? ""}
          placeholder={until ? "required" : "= at least"}
          onChange={(e) =>
            set({
              codersPerUnit: range(until ? undefined : criteria.codersPerUnit?.min, numberOrUndefined(e.target.value)),
            })
          }
        />
        {until ? (
          <span className="flex items-center gap-1.5">
            agree on
            <select
              className={selectClass}
              aria-label="Question coders agree on"
              value={until.on}
              onChange={(e) => set({ until: { ...until, on: e.target.value } })}
            >
              {!agreeable.includes(until.on) && <option value={until.on}>{until.on || "(choose a question)"}</option>}
              {agreeable.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </span>
        ) : (
          <span />
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {until
          ? "A unit is done once the least number of coders agree on the question, or the most coders coded it."
          : "A unit is done once the least number of coders coded it. When no unit needs more, coders get units up to the most."}
      </p>
      <label className={labelClass}>
        Priority
        <select
          className={`${selectClass} w-fit`}
          value={criteria.priority ?? "cover"}
          onChange={(e) => set({ priority: e.target.value as Criteria["priority"] })}
        >
          <option value="cover">Cover all units first</option>
          <option value="saturate">Finish units first</option>
        </select>
      </label>
    </div>
  );
}
