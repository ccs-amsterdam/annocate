import { cn } from "cn";
import {
  GOLD_SET,
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
import { OverlapEditor, PracticeEditor, GoldEditor } from "./SpecialUnits";

// A unit loop's units settings: which of the session's units it hands out (a
// filter on a set column), a shared queue's criteria, and its special units.

/** A loop's units: its filter, criteria (a shared queue), and the special units. */
export function UnitsEditor({
  units: settings,
  groups,
  agreeable,
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
  agreeable: string[];
  checkable: AnswerKeyQuestion[];
  screenouts: string[];
  issues: DesignIssue[];
  onChange: (units: LoopUnits) => void;
}) {
  const special = allColumns(groups);
  // The column with practice or gold units (their right answers are edited by column)
  const columnWith = (set: string) =>
    groups.find((g) => g.sets.some((s) => s.name === set && s.unitIds.length > 0)) ?? groups[0];
  const canSpread = !settings.criteria || settings.criteria.unitsPerCoder?.max !== undefined;
  const without = (key: keyof LoopUnits) => {
    const next = { ...settings };
    delete next[key];
    return next;
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-1 text-xs">
        <span>{shareSummary(shareSources, settings.filter)}</span>
        <HelpButton topic="unit-distribution" label="Help: unit distribution" />
      </p>
      <FilterEditor
        groups={groups}
        filter={settings.filter}
        onChange={(filter) => onChange(filter ? { ...settings, filter } : without("filter"))}
      />
      <label className="flex items-center gap-2 text-xs font-semibold">
        <input
          type="checkbox"
          checked={!!settings.criteria}
          onChange={(e) =>
            onChange(e.target.checked ? { ...settings, criteria: { codersPerUnit: { min: 1 } } } : without("criteria"))
          }
        />
        Share the units among coders (crowd coding): each unit until enough coders coded it
      </label>
      {settings.criteria && (
        <SharedSettings
          criteria={settings.criteria}
          agreeable={agreeable}
          onChange={(criteria) => onChange({ ...settings, criteria })}
        />
      )}
      <OverlapEditor
        overlap={settings.overlap}
        group={special}
        canSpread={canSpread}
        onChange={(overlap) => onChange(overlap ? { ...settings, overlap } : without("overlap"))}
      />
      <PracticeEditor
        practice={settings.practice}
        group={columnWith(PRACTICE_SET)}
        checkable={checkable}
        answerKey={answerKey}
        canSpread={canSpread}
        onChange={(practice) => onChange(practice ? { ...settings, practice } : without("practice"))}
      />
      <GoldEditor
        gold={settings.gold}
        group={columnWith(GOLD_SET)}
        checkable={checkable}
        answerKey={answerKey}
        screenouts={screenouts}
        canSpread={canSpread}
        onChange={(gold) => onChange(gold ? { ...settings, gold } : without("gold"))}
      />
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
          <option value="">All the session&apos;s units</option>
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
