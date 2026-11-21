import { cn } from "cn";
import {
  GOLD_SET,
  OVERLAP_SET,
  PRACTICE_SET,
  type Criteria,
  type DesignIssue,
  type SetGroupResponse,
  type LoopUnits,
  type UnitFilter,
} from "@annotinder/contracts";
import { Input } from "@/components/ui/input";
import { IssueList } from "../IssueList";
import { HelpButton } from "../../../help/HelpButton";
import { shareSummary, valueCounts, type ShareSource } from "../../../design/assignment";
import { type AnswerKeyQuestion } from "../units/AnswerKeyDialog";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { selectClass, labelClass, type AnswerKeyContext, allColumns, numberOrUndefined, range } from "./helpers";
import { GoldChecks, PlacementRow, PracticeChecks } from "./SpecialUnits";

// A unit loop's units settings (contracts `LoopUnitsSchema`), like a filter
// on the coder's units: some values of a set column, the coder's own units
// yes or no, and where the special units go; with the checks on practice and
// gold units. Who gets which units is the invitation's.

/** A loop's units: its filter, the coder's own units, the special units and their checks. */
export function UnitsEditor({
  units: settings,
  groups,
  checkable,
  answerKey,
  screenouts,
  shareSources,
  issues,
  onChange,
}: {
  units: LoopUnits;
  shareSources: ShareSource[];
  answerKey?: AnswerKeyContext;
  client?: ResearcherApi;
  groups: SetGroupResponse[];
  checkable: AnswerKeyQuestion[];
  screenouts: string[];
  issues: DesignIssue[];
  onChange: (units: LoopUnits) => void;
}) {
  const special = allColumns(groups);
  const count = (set: string) => special?.sets.find((s) => s.name === set)?.unitIds.length ?? 0;
  // The column with practice or gold units (their right answers are edited by column)
  const columnWith = (set: string) =>
    groups.find((g) => g.sets.some((s) => s.name === set && s.unitIds.length > 0)) ?? groups[0];
  const set = <K extends keyof LoopUnits>(key: K, value: LoopUnits[K] | undefined) => {
    const next = { ...settings, [key]: value };
    if (value === undefined) delete next[key];
    onChange(next);
  };
  const shows = (kind: "practice" | "gold", set: string, check: unknown) =>
    settings[kind] !== "ignore" && (count(set) > 0 || check !== undefined);
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-1 text-xs">
        <span>{shareSummary(shareSources, settings.filter)}</span>
        <HelpButton topic="unit-distribution" label="Help: unit distribution" />
      </p>
      <FilterEditor groups={groups} filter={settings.filter} onChange={(filter) => set("filter", filter)} />
      <div className="grid w-fit grid-cols-[auto_2.5rem_auto] items-center gap-x-3 gap-y-1.5">
        <span className="text-xs font-semibold">The coder&apos;s own units</span>
        <span />
        <select
          className={`${selectClass} w-fit font-normal`}
          aria-label="The coder's own units"
          value={settings.own === false ? "no" : "yes"}
          onChange={(e) => set("own", e.target.value === "no" ? false : undefined)}
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
        Special units are those marked {OVERLAP_SET}, {PRACTICE_SET} or {GOLD_SET} in a set column. Spread in a shared
        queue without a maximum of units per coder: about one in ten.
      </p>
      {shows("practice", PRACTICE_SET, settings.practiceCheck) && (
        <PracticeChecks
          check={settings.practiceCheck}
          group={columnWith(PRACTICE_SET)}
          checkable={checkable}
          answerKey={answerKey}
          onChange={(check) => set("practiceCheck", check)}
        />
      )}
      {shows("gold", GOLD_SET, settings.goldCheck) && (
        <GoldChecks
          check={settings.goldCheck}
          group={columnWith(GOLD_SET)}
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

/** A loop's filter: none, or only / except some values of a set column. */
function FilterEditor({
  groups,
  filter,
  onChange,
}: {
  groups: SetGroupResponse[];
  filter: UnitFilter | undefined;
  onChange: (filter: UnitFilter | undefined) => void;
}) {
  const values = filter ? (filter.only ?? filter.except ?? []) : [];
  const column = groups.find((g) => g.name === filter?.column);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className={labelClass}>
        Units
        <select
          className={`${selectClass} w-fit font-normal`}
          value={filter ? (filter.only ? "only" : "except") : ""}
          onChange={(e) => {
            const kind = e.target.value;
            if (!kind) return onChange(undefined);
            const col = filter?.column ?? groups[0]?.name ?? "";
            onChange(
              kind === "only"
                ? { column: col, only: values.length ? values : [""] }
                : { column: col, except: values.length ? values : [""] },
            );
          }}
        >
          <option value="">All the coder&apos;s units</option>
          <option value="only">Only those with a value of a set column</option>
          <option value="except">Except those with a value of a set column</option>
        </select>
      </label>
      {filter && (
        <>
          <label className={labelClass}>
            Column
            <select
              className={`${selectClass} w-fit font-normal ${column ? "" : "border-destructive"}`}
              value={filter.column}
              onChange={(e) => onChange({ ...filter, column: e.target.value })}
            >
              {!column && <option value={filter.column}>{filter.column || "Choose…"}</option>}
              {groups.map((g) => (
                <option key={g.name} value={g.name}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <div className={labelClass}>
            Values
            <div className="flex flex-wrap gap-1">
              {valueCounts(groups, filter.column).map(({ value, count }) => {
                const on = values.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      const list = on ? values.filter((v) => v !== value) : [...values.filter(Boolean), value];
                      const key = filter.only ? "only" : "except";
                      onChange({ column: filter.column, [key]: list.length ? list : [""] } as UnitFilter);
                    }}
                    className={cn(
                      "cursor-pointer rounded-full border px-2 py-0.5 text-[11px] font-normal",
                      on
                        ? "border-wood bg-wood/15 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {value} <span className="text-muted-foreground">{count}</span>
                  </button>
                );
              })}
              {!column && (
                <span className="text-[11px] font-normal text-muted-foreground">No units with this column yet</span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
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
