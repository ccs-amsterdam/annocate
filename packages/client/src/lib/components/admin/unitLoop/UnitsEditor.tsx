import { cn } from "cn";
import {
  GOLD_SET,
  OVERLAP_SET,
  PRACTICE_SET,
  type Criteria,
  type DesignIssue,
  type SetGroupResponse,
  type LoopUnits,
  type Subset,
} from "@annotinder/contracts";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/info-tip";
import { IssueList } from "../IssueList";
import { HelpButton } from "../../../help/HelpButton";
import { columnValues, shareSummary, type LoopUnitsContext } from "../../../design/assignment";
import { type AnswerKeyQuestion } from "../units/AnswerKeyDialog";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { selectClass, labelClass, type AnswerKeyContext, numberOrUndefined, range } from "./helpers";
import { GoldChecks, PlacementRow, PracticeChecks } from "./SpecialUnits";

// A unit loop's units settings (contracts `LoopUnitsSchema`), within the
// coder's units (who the coders are is the coder unit assignment's): an
// earlier loop's units or a subset (some sets of a set column), for a crowd
// whether they are divided among the coders, and the coding and special
// units of the assignment's column (where they go); with the checks on
// practice and gold units.

/** A loop's units: which units, dividing them, the coding and special units and their checks. */
export function UnitsEditor({
  units: settings,
  groups,
  checkable,
  agreeable,
  answerKey,
  screenouts,
  context,
  issues,
  onChange,
}: {
  units: LoopUnits;
  context: LoopUnitsContext;
  answerKey?: AnswerKeyContext;
  client?: ResearcherApi;
  groups: SetGroupResponse[];
  checkable: AnswerKeyQuestion[];
  /** The loop's questions an agreement rule can use. */
  agreeable: string[];
  screenouts: string[];
  issues: DesignIssue[];
  onChange: (units: LoopUnits) => void;
}) {
  const { invite, earlier } = context;
  const column = invite.column ? groups.find((g) => g.name === invite.column) : undefined;
  const count = (set: string) => column?.sets.find((s) => s.name === set)?.unitIds.length ?? 0;
  const set = <K extends keyof LoopUnits>(key: K, value: LoopUnits[K] | undefined) => {
    const next = { ...settings, [key]: value };
    if (value === undefined) delete next[key];
    onChange(next);
  };
  const sameAs = settings.sameAs;
  const shows = (kind: "practice" | "gold", set: string, check: unknown) =>
    settings[kind] !== "ignore" && (count(set) > 0 || check !== undefined);
  const codingCount = column
    ? new Set(column.sets.filter((s) => !s.name.startsWith("_")).flatMap((s) => s.unitIds)).size
    : 0;
  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-1 text-xs">
        <span>{shareSummary(context.sources, settings.subset)}</span>
        <HelpButton topic="unit-distribution" label="Help: unit distribution" />
      </p>
      {earlier.length > 0 && (
        <label className={labelClass}>
          Coding units
          <select
            className={`${selectClass} w-fit font-normal`}
            value={sameAs === undefined ? "" : String(sameAs)}
            onChange={(e) => {
              const n = e.target.value === "" ? undefined : Number(e.target.value);
              const next: LoopUnits = { ...settings, sameAs: n };
              if (n === undefined) delete next.sameAs;
              else {
                // An earlier loop's units: not selected or divided again here
                delete next.subset;
                delete next.divide;
              }
              onChange(next);
            }}
          >
            <option value="">Selected for this loop</option>
            {earlier.map((l) => (
              <option key={l.number} value={l.number}>
                The units each coder got in {l.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {sameAs === undefined && (
        <SubsetEditor
          groups={groups}
          assignmentColumn={invite.column}
          subset={settings.subset}
          onChange={(subset) => set("subset", subset)}
        />
      )}
      {/* For a crowd; shown for specific coders only to undo a leftover divide (an error there) */}
      {(invite.mode === "crowd" || settings.divide) && sameAs === undefined && (
        <Divide criteria={settings.divide} agreeable={agreeable} onChange={(divide) => set("divide", divide)} />
      )}
      {!invite.column ? (
        <p className="text-[11px] text-muted-foreground">
          Special units (overlap, practice and gold) come from the set column of the coder unit assignment, which has
          none{invite.mode === "crowd" ? " (optional for a crowd)" : ""}. Set it in the Study entry&apos;s{" "}
          <strong>Coder unit assignments</strong>.
        </p>
      ) : (
        <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-1 text-xs font-semibold">
            Coding and special units
            <span className="font-normal text-muted-foreground">
              of column <span className="font-mono">{invite.column}</span> (Coder unit assignments)
            </span>
          </h3>
          {!column && (
            <p className="text-[11px] text-destructive">The units have no column &quot;{invite.column}&quot; yet.</p>
          )}
          <div className="grid w-fit grid-cols-[auto_2.5rem_auto] items-center gap-x-3 gap-y-1.5">
            <span className="text-xs font-semibold">Coding units</span>
            <span
              className="text-right font-mono text-[11px] text-muted-foreground"
              title="Units with another value than a special one"
            >
              {invite.mode === "crowd" && codingCount === 0 ? "all" : codingCount}
            </span>
            <select
              className={`${selectClass} w-fit font-normal`}
              aria-label="Coding units"
              value={settings.coding === false ? "no" : "yes"}
              onChange={(e) => set("coding", e.target.value === "no" ? false : undefined)}
            >
              <option value="yes">Include</option>
              <option value="no">Leave out (only special units)</option>
            </select>
            <PlacementRow
              label="Overlap units"
              help="overlap"
              count={count(OVERLAP_SET)}
              value={settings.overlap}
              onChange={(p) => set("overlap", p === "spread" ? undefined : p)}
            />
            <PlacementRow
              label="Practice units"
              count={count(PRACTICE_SET)}
              value={settings.practice}
              onChange={(p) => set("practice", p === "spread" ? undefined : p)}
            />
            <PlacementRow
              label="Gold units"
              help="special-units"
              count={count(GOLD_SET)}
              value={settings.gold}
              onChange={(p) => set("gold", p === "spread" ? undefined : p)}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Spread throughout a divided crowd&apos;s units without a maximum of units per coder: about one in ten.
          </p>
        </section>
      )}
      {column && shows("practice", PRACTICE_SET, settings.practiceCheck) && (
        <PracticeChecks
          check={settings.practiceCheck}
          group={column}
          checkable={checkable}
          answerKey={answerKey}
          onChange={(check) => set("practiceCheck", check)}
        />
      )}
      {column && shows("gold", GOLD_SET, settings.goldCheck) && (
        <GoldChecks
          check={settings.goldCheck}
          group={column}
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
 * A loop's subset: a set column (not the coder unit assignment's) and the
 * sets of it to include; none, all the coder's units.
 */
function SubsetEditor({
  groups,
  assignmentColumn,
  subset,
  onChange,
}: {
  groups: SetGroupResponse[];
  assignmentColumn: string | undefined;
  subset: Subset | undefined;
  onChange: (subset: Subset | undefined) => void;
}) {
  const column = groups.find((g) => g.name === subset?.column);
  const chosen = subset?.sets ?? [];
  return (
    <div className="flex flex-wrap items-start gap-3">
      <label className={labelClass}>
        <span className="flex items-center gap-1">
          Select unit subset(s)
          <InfoTip label="About subsets">
            Code only some of the coder&apos;s units in this loop: those in the chosen sets of a set column (e.g. a{" "}
            <span className="font-mono">phase</span> column with <span className="font-mono">pre</span> and{" "}
            <span className="font-mono">post</span>). The coder unit assignment&apos;s column can&apos;t be used: it
            already says whose units are whose.
          </InfoTip>
        </span>
        <select
          className={cn(selectClass, "w-fit font-normal", subset && !column && "border-destructive")}
          value={subset?.column ?? ""}
          onChange={(e) => (e.target.value ? onChange({ column: e.target.value, sets: [] }) : onChange(undefined))}
        >
          <option value="">All the coder&apos;s units</option>
          {subset && !column && <option value={subset.column}>{subset.column} (no such column)</option>}
          {groups.map((g) => (
            <option key={g.name} value={g.name} disabled={g.name === assignmentColumn}>
              {g.name}
              {g.name === assignmentColumn ? " (coder unit assignment)" : ""}
            </option>
          ))}
        </select>
      </label>
      {subset && column && (
        <div className={labelClass}>
          Sets to include
          <div className="flex flex-wrap gap-1" role="group" aria-label="Sets to include">
            {columnValues(groups, subset.column).map((value) => {
              const on = chosen.includes(value);
              const units = column.sets.find((s) => s.name === value)?.unitIds.length ?? 0;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    onChange({
                      column: subset.column,
                      sets: on ? chosen.filter((v) => v !== value) : [...chosen, value],
                    })
                  }
                  className={cn(
                    "cursor-pointer rounded-full border px-2 py-0.5 text-[11px] font-normal",
                    on
                      ? "border-wood bg-wood/15 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {value} <span className="text-muted-foreground">{units}</span>
                </button>
              );
            })}
          </div>
        </div>
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
          The units are handed out until each has enough coders: coders get the units that still need them. Coders of a
          link per set divide that set.
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
