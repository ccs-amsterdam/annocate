import { useState, type ReactNode } from "react";
import { Code, Plus, Trash2 } from "lucide-react";
import { cn } from "cn";
import {
  CHECKABLE_TYPES,
  DEFAULT_RATE,
  GOLD_SET,
  OVERLAP_SET,
  PRACTICE_SET,
  goldColumn,
  practiceColumn,
  practiceMessageColumn,
  supportsAgreement,
  type GoldSettings,
  type PracticeSettings,
  type AnyVariableType,
  type Criteria,
  type DesignItem,
  type DesignIssue,
  type OverlapSettings,
  type SetGroupResponse,
  type LoopUnits,
  type UnitFilter,
  type UnitLayout,
  type UnitLoopItem,
} from "@annotinder/contracts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLoopTab, type LoopTab } from "./designEditor/loopTab";
import { TemplateCodeEditor, type TemplateEditorApi } from "./jsonEditor/TemplateCodeEditor";
import { ConditionDialog, TemplateInsertMenu } from "./TemplateInsertMenu";
import { IssueList } from "./IssueList";
import { issuesAt } from "./issues";
import { HelpButton } from "../../help/HelpButton";
import { shareSummary, valueCounts, type ShareSource } from "../../design/assignment";
import { parseSimpleLayout, simpleTemplate } from "../../design/simpleLayout";
import { LayoutDesigner } from "./LayoutDesigner";
import { AnswerKeyDialog, type AnswerKeyQuestion } from "./units/AnswerKeyDialog";
import type { ResearcherApi } from "../../api/httpResearcherApi";

const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-xs";
const labelClass = "flex flex-col gap-1 text-xs font-semibold";

/** The names of a loop's questions, in order (through conditions). */
function questionNames(items: DesignItem[]): string[] {
  return items.flatMap((i) => (i.type === "show_if" ? questionNames(i.children as DesignItem[]) : "name" in i ? [i.name] : []));
}

/** A loop's questions with their answer types (through conditions). */
function questionsOf(items: DesignItem[]): { name: string; variable: AnyVariableType }[] {
  return items.flatMap((i) => (i.type === "show_if" ? questionsOf(i.children as DesignItem[]) : "variable" in i ? [{ name: i.name, variable: i.variable }] : []));
}

/** The loop's questions an agreement rule can compare (contracts `supportsAgreement`). */
/** The loop's questions that gold and practice units can check (compared by value). */
function checkableQuestions(items: DesignItem[]): AnswerKeyQuestion[] {
  return items.flatMap((i): AnswerKeyQuestion[] => {
    if (i.type === "show_if") return checkableQuestions(i.children as DesignItem[]);
    return "variable" in i && (CHECKABLE_TYPES as readonly string[]).includes(i.variable.type) ? [{ name: i.name, variable: i.variable }] : [];
  });
}

/** What "Right answers…" needs: the API and the loop's layout. */
interface AnswerKeyContext {
  client: ResearcherApi;
  layout: UnitLayout;
}

function agreementQuestions(items: DesignItem[]): string[] {
  return items.flatMap((i) => {
    if (i.type === "show_if") return agreementQuestions(i.children as DesignItem[]);
    return "variable" in i && supportsAgreement(i.variable) ? [i.name] : [];
  });
}

/**
 * Edits a unit_loop, in two tabs: how a unit is shown (the template and
 * its snippets), and which units coders get (contracts
 * unitLoop.ts: the loop's `units` settings, and the order).
 */
export function UnitLoopForm({
  loop,
  client,
  groups,
  unitFields,
  coderQuestions,
  screenouts = [],
  validationIssues,
  shareSources = [],
  readOnly = false,
  onChange,
}: {
  loop: UnitLoopItem;
  /** What selects a session's units (its coder, linked conditions): for the Units tab's summary. */
  shareSources?: ShareSource[];
  /** The codebook's end items with outcome `screenout`: where gold checks can end a session. */
  screenouts?: string[];
  /** For "Generate sets…" (absent: not offered). */
  client?: ResearcherApi;
  /** The study's set groups. */
  groups: SetGroupResponse[];
  /** The study's unit fields, for completions in the template. */
  unitFields: string[];
  /** Coder-level questions before the loop: what the layout's conditions may use. */
  coderQuestions: { name: string; variable: AnyVariableType }[];
  validationIssues: DesignIssue[];
  readOnly?: boolean;
  onChange: (loop: UnitLoopItem) => void;
}) {
  const [tab, setTab] = useLoopTab();
  const tabs: { value: LoopTab; label: string; issues: DesignIssue[] }[] = [
    { value: "layout", label: "Layout", issues: issuesAt(validationIssues, "layout") },
    { value: "units", label: "Units", issues: [...issuesAt(validationIssues, "units"), ...issuesAt(validationIssues, "order")] },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              "-mb-px flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs font-semibold transition-colors",
              tab === t.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.issues.some((i) => !i.warning) && <span className="h-1.5 w-1.5 rounded-full bg-destructive" title="Has problems" />}
          </button>
        ))}
      </div>
      {tab === "units" ? (
        <UnitsTab
          loop={loop}
          client={client}
          groups={groups}
          screenouts={screenouts}
          validationIssues={validationIssues}
          shareSources={shareSources}
          onChange={onChange}
        />
      ) : (
        <LayoutTab
          loop={loop}
          unitFields={unitFields}
          coderQuestions={coderQuestions}
          issues={issuesAt(validationIssues, "layout")}
          readOnly={readOnly}
          onChange={onChange}
        />
      )}
    </div>
  );
}

/** A titled part of a tab, with a line of help and a help topic. */
function Section({ title, help, topic, children }: { title: string; help?: string; topic?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="flex items-center gap-1.5 text-xs font-semibold">
          {title}
          {topic && <HelpButton topic={topic} label={`Help: ${title}`} />}
        </h3>
        {help && <p className="text-[11px] text-muted-foreground">{help}</p>}
      </div>
      {children}
    </section>
  );
}

/** Which units coders get (the loop's `units`), and the order. */
function UnitsTab({
  loop,
  client,
  groups,
  screenouts,
  validationIssues,
  shareSources,
  onChange,
}: {
  loop: UnitLoopItem;
  client?: ResearcherApi;
  groups: SetGroupResponse[];
  screenouts: string[];
  validationIssues: DesignIssue[];
  shareSources: ShareSource[];
  onChange: (loop: UnitLoopItem) => void;
}) {
  const setUnits = (units: LoopUnits) => {
    const next: UnitLoopItem = { ...loop, units };
    // Nothing set: all the session's units, once (the default)
    if (Object.keys(units).length === 0) delete next.units;
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-5">
      <UnitsEditor
        units={loop.units ?? {}}
        client={client}
        groups={groups}
        agreeable={agreementQuestions(loop.children as DesignItem[])}
        checkable={checkableQuestions(loop.children as DesignItem[])}
        answerKey={client && loop.layout ? { client, layout: loop.layout } : undefined}
        screenouts={screenouts}
        shareSources={shareSources}
        issues={issuesAt(validationIssues, "units")}
        onChange={setUnits}
      />

      <Section title="Order" topic="unit-distribution#order">
        <select
          className={`${selectClass} w-fit`}
          value={loop.order ?? "sequential"}
          onChange={(e) => onChange({ ...loop, order: e.target.value as UnitLoopItem["order"] })}
        >
          <option value="sequential">In set order</option>
          <option value="random">Random (each coder their own order)</option>
        </select>
      </Section>
    </div>
  );
}

/** Light, dark, or the coder's mode. */
function ColourScheme({ layout, onChange }: { layout: UnitLayout; onChange: (layout: UnitLayout) => void }) {
  return (
    <Section title="Colours" topic="colours-and-styles#light-or-dark">
      <select
        className={`${selectClass} w-fit`}
        value={layout.colorScheme ?? ""}
        onChange={(e) => {
          const next = { ...layout, colorScheme: (e.target.value || undefined) as UnitLayout["colorScheme"] };
          if (!next.colorScheme) delete next.colorScheme;
          onChange(next);
        }}
      >
        <option value="">Follow the coder&apos;s light or dark mode</option>
        <option value="light">Always light</option>
        <option value="dark">Always dark</option>
      </select>
    </Section>
  );
}

/** How a unit is shown: a simple form (title, byline, body), or the markdown template and its snippets. */
function LayoutTab({
  loop,
  unitFields,
  coderQuestions,
  issues,
  readOnly,
  onChange,
}: {
  loop: UnitLoopItem;
  unitFields: string[];
  coderQuestions: { name: string; variable: AnyVariableType }[];
  issues: DesignIssue[];
  readOnly: boolean;
  onChange: (loop: UnitLoopItem) => void;
}) {
  const layout = loop.layout ?? { template: "" };
  const snippets = Object.entries(layout.snippets ?? {});
  const loopQuestions = questionNames(loop.children as DesignItem[]);
  // `::: if` in the layout may use coder-level questions, and (inside `::: from`) the loop's own.
  const conditionQuestions = [...coderQuestions, ...questionsOf(loop.children as DesignItem[])];
  const names = {
    // `$unit.id` is each unit's id (unless a field is called id)
    fields: unitFields.includes("id") ? unitFields : [...unitFields, "id"],
    snippets: snippets.map(([n]) => n),
    questions: conditionQuestions.map((q) => q.name),
    loopQuestions,
  };
  const [editor, setEditor] = useState<TemplateEditorApi | null>(null);
  const [editing, setEditing] = useState<{ condition: { script: string }; apply: (script: string) => void } | null>(null);
  // The simple form (title, byline, body) unless the template is more than it can show, or the researcher chose to write it.
  const simple = parseSimpleLayout(layout.template);
  const [advanced, setAdvanced] = useState(simple === null);
  const setLayout = (next: Partial<UnitLayout>) => onChange({ ...loop, layout: { ...layout, ...next } });
  const setSnippets = (entries: [string, string][]) => {
    const next = { ...layout };
    if (entries.length === 0) delete next.snippets;
    else next.snippets = Object.fromEntries(entries);
    onChange({ ...loop, layout: next });
  };

  if (!advanced && simple) {
    return (
      <div className="flex flex-col gap-5">
        <Section title="Layout" help="What coders see of each unit." topic="layout-templates">
          {readOnly ? (
            <pre className="whitespace-pre-wrap rounded-md border border-input p-2 font-mono text-xs">{layout.template}</pre>
          ) : (
            <LayoutDesigner layout={simple} fields={names.fields} onChange={(next) => setLayout({ template: simpleTemplate(next) })} />
          )}
          <IssueList issues={issues} />
        </Section>
        <ColourScheme layout={layout} onChange={(next) => onChange({ ...loop, layout: next })} />
        <button
          type="button"
          onClick={() => setAdvanced(true)}
          className="flex w-fit cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Code className="h-3.5 w-3.5" /> Advanced: write the layout as a template (markdown, blocks, styles, snippets)…
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {!readOnly && (
        <div className="-mb-3 flex items-center justify-between gap-2">
          {simple ? (
            <button type="button" onClick={() => setAdvanced(false)} className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              ← Simple form
            </button>
          ) : (
            <button
              type="button"
              title="Replaces this template with a title, byline and body chosen in a form"
              onClick={() => {
                if (!confirm("Replace this template with the simple form (title, byline, body)?")) return;
                // An empty sketch: the researcher places the fields
                setLayout({ template: "" });
                setAdvanced(false);
              }}
              className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
            >
              Use the simple form instead…
            </button>
          )}
          <TemplateInsertMenu
            editor={editor}
            fields={unitFields}
            loopQuestions={loopQuestions}
            questions={conditionQuestions}
            snippets={names.snippets}
          />
        </div>
      )}
      <Section title="Template" topic="layout-templates">
        <div
          className={cn(
            "overflow-hidden rounded-md border",
            issues.some((i) => !i.warning && !i.path.includes("snippets")) ? "border-destructive" : "border-input",
          )}
        >
          <TemplateCodeEditor
            value={layout.template}
            names={names}
            readOnly={readOnly}
            onChange={(template) => setLayout({ template })}
            onReady={setEditor}
            onEditCondition={(script, apply) => setEditing({ condition: { script }, apply })}
          />
        </div>
        <IssueList issues={issues} />
        <ConditionDialog
          condition={editing?.condition ?? null}
          questions={conditionQuestions}
          title="Edit condition"
          action="Apply"
          onClose={() => setEditing(null)}
          onDone={(script) => editing?.apply(script)}
        />
      </Section>

      {/* Optional: open by itself when in use */}
      <details className="group rounded-md border border-border/70 px-3 py-2" open={snippets.length > 0 || layout.colorScheme !== undefined}>
        <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground hover:text-foreground">
          More layout options: colours, snippets
        </summary>
        <div className="mt-3 flex flex-col gap-4">
          <ColourScheme layout={layout} onChange={(next) => onChange({ ...loop, layout: next })} />

          <Section title="Snippets" topic="snippets">
            {snippets.map(([name, value], i) => (
              <div key={i} className="flex flex-col gap-1 rounded-md border border-border p-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">[[</span>
                  <Input
                    aria-label="Snippet name"
                    className="h-7 w-48 font-mono text-xs"
                    value={name}
                    placeholder="name"
                    onChange={(e) => {
                      const renamed = e.target.value;
                      // A name another snippet has would merge them: not taken.
                      if (snippets.some(([n], j) => j !== i && n === renamed)) return;
                      setSnippets(snippets.map((c, j) => (j === i ? [renamed, c[1]] : c)));
                    }}
                  />
                  <span className="font-mono text-xs text-muted-foreground">]]</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto"
                    aria-label={`Remove ${name}`}
                    onClick={() => setSnippets(snippets.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Textarea
                  aria-label={`Text of ${name}`}
                  className="field-sizing-content max-h-60 min-h-12 font-mono text-xs"
                  rows={2}
                  value={value}
                  onChange={(e) => setSnippets(snippets.map((c, j) => (j === i ? [c[0], e.target.value] : c)))}
                />
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => {
                let n = snippets.length + 1;
                while (snippets.some(([c]) => c === `snippet_${n}`)) n++;
                setSnippets([...snippets, [`snippet_${n}`, ""]]);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Snippet
            </Button>
          </Section>
        </div>
      </details>
    </div>
  );
}

/**
 * The special sets of every set column as one group: practice and gold
 * units of any column are everyone's; the overlap counts here are an upper
 * bound (a session gets those of its own columns).
 */
function allColumns(groups: SetGroupResponse[]): SetGroupResponse | undefined {
  if (groups.length === 0) return undefined;
  const union = (set: string) => [...new Set(groups.flatMap((g) => g.sets.find((s) => s.name === set)?.unitIds ?? []))];
  return {
    name: "(all set columns)",
    sets: [OVERLAP_SET, PRACTICE_SET, GOLD_SET].map((name) => ({ name, unitIds: union(name), ordered: false })),
  };
}

/** A loop's units: its filter, criteria (a shared queue), and the special units. */
function UnitsEditor({
  units: branch,
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
  const columnWith = (set: string) => groups.find((g) => g.sets.some((s) => s.name === set && s.unitIds.length > 0)) ?? groups[0];
  const canSpread = !branch.criteria || branch.criteria.unitsPerCoder?.max !== undefined;
  const without = (key: keyof LoopUnits) => {
    const next = { ...branch };
    delete next[key];
    return next;
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-1 text-xs">
        <span>{shareSummary(shareSources, branch.filter)}</span>
        <HelpButton topic="unit-distribution" label="Help: unit distribution" />
      </p>
      <FilterEditor groups={groups} filter={branch.filter} onChange={(filter) => onChange(filter ? { ...branch, filter } : without("filter"))} />
      <label className="flex items-center gap-2 text-xs font-semibold">
        <input
          type="checkbox"
          checked={!!branch.criteria}
          onChange={(e) => onChange(e.target.checked ? { ...branch, criteria: { codersPerUnit: { min: 1 } } } : without("criteria"))}
        />
        Share the units among coders (crowd coding): each unit until enough coders coded it
      </label>
      {branch.criteria && (
        <SharedSettings criteria={branch.criteria} agreeable={agreeable} onChange={(criteria) => onChange({ ...branch, criteria })} />
      )}
      <OverlapEditor
        overlap={branch.overlap}
        required={false}
        group={special}
        canSpread={canSpread}
        onChange={(overlap) => onChange(overlap ? { ...branch, overlap } : without("overlap"))}
      />
      <PracticeEditor
        practice={branch.practice}
        group={columnWith(PRACTICE_SET)}
        checkable={checkable}
        answerKey={answerKey}
        canSpread={canSpread}
        onChange={(practice) => onChange(practice ? { ...branch, practice } : without("practice"))}
      />
      <GoldEditor
        gold={branch.gold}
        group={columnWith(GOLD_SET)}
        checkable={checkable}
        answerKey={answerKey}
        screenouts={screenouts}
        canSpread={canSpread}
        onChange={(gold) => onChange(gold ? { ...branch, gold } : without("gold"))}
      />
      <IssueList issues={issues} />
    </div>
  );
}

/** A loop's filter: none, or only / except some values of a set column. */
function FilterEditor({ groups, filter, onChange }: { groups: SetGroupResponse[]; filter: UnitFilter | undefined; onChange: (filter: UnitFilter | undefined) => void }) {
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
            onChange(kind === "only" ? { column: col, only: values.length ? values : [""] } : { column: col, except: values.length ? values : [""] });
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
                      on ? "border-wood bg-wood/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {value} <span className="text-muted-foreground">{count}</span>
                  </button>
                );
              })}
              {!column && <span className="text-[11px] font-normal text-muted-foreground">No units with this column yet</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const numberOrUndefined = (v: string) => (v === "" ? undefined : Number(v));

/** A range without empty ends; undefined when both are empty. */
function range(min: number | undefined, max: number | undefined) {
  const out = { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
  return Object.keys(out).length ? out : undefined;
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
          onChange={(e) => set({ unitsPerCoder: range(numberOrUndefined(e.target.value), criteria.unitsPerCoder?.max) })}
        />
        <Input
          type="number"
          min={1}
          className={numberInput}
          aria-label="Max units per coder"
          value={criteria.unitsPerCoder?.max ?? ""}
          placeholder="no limit"
          onChange={(e) => set({ unitsPerCoder: range(criteria.unitsPerCoder?.min, numberOrUndefined(e.target.value)) })}
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
                set({ until: { agree: n, on: agreeable[0] ?? "" }, codersPerUnit: { max: maxCoders === undefined || maxCoders < n ? Math.max(3, n + 1) : maxCoders } });
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
          onChange={(e) => set({ codersPerUnit: range(until ? undefined : criteria.codersPerUnit?.min, numberOrUndefined(e.target.value)) })}
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

/**
 * The overlap: the group's `_overlap` units, which every coder of the group
 * codes besides their own set; where they come, and how many. Required in
 * `assign` mode (choosing "disabled" too), so it is decided on purpose.
 */
function OverlapEditor({
  overlap,
  required,
  group,
  canSpread,
  onChange,
}: {
  overlap: OverlapSettings | undefined;
  required: boolean;
  group: SetGroupResponse | undefined;
  /** Spreading needs the number of units a coder gets: not known in a shared queue without max units per coder. */
  canSpread: boolean;
  onChange: (overlap: OverlapSettings | undefined) => void;
}) {
  const units = group?.sets.find((s) => s.name === OVERLAP_SET)?.unitIds.length ?? 0;
  const on = overlap !== undefined && overlap.placement !== "disabled";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <label className={labelClass}>
          <span className="flex items-center gap-1.5">
            Overlap: units every coder codes too
            <HelpButton topic="overlap" label="Help: overlap" />
          </span>
          <select
            className={cn(selectClass, "w-fit font-normal", required && !overlap && "border-amber-500")}
            value={overlap?.placement ?? ""}
            onChange={(e) => {
              const placement = e.target.value as OverlapSettings["placement"] | "";
              onChange(placement === "" ? undefined : { ...overlap, placement });
            }}
          >
            {required ? (
              <option value="" disabled>
                Choose…
              </option>
            ) : (
              <option value="">None</option>
            )}
            <option value="spread" disabled={!canSpread}>
              Spread through the coder&apos;s units (recommended){canSpread ? "" : " (needs max units per coder)"}
            </option>
            <option value="rate">At a rate: about one in every few units{canSpread ? "" : " (recommended for crowd coding)"}</option>
            <option value="first">First, before the coder&apos;s own units (inflates reliability)</option>
            <option value="last">Last, after them</option>
            {required && <option value="disabled">Disabled: no overlap</option>}
          </select>
        </label>
        {on && overlap.placement === "rate" && <RateFields value={overlap} onChange={(rate) => onChange({ ...overlap, ...rate })} />}
        {on && (
          <>
            <label className={labelClass}>
              Recommended
              <Input
                type="number"
                min={1}
                className="h-8 w-24 text-xs font-normal"
                placeholder="any"
                title="Warns at deploying if the group has fewer overlap units"
                value={overlap.expect ?? ""}
                onChange={(e) => onChange({ ...overlap, expect: numberOrUndefined(e.target.value) })}
              />
            </label>
            <label className={labelClass}>
              At most
              <Input
                type="number"
                min={1}
                className="h-8 w-24 text-xs font-normal"
                placeholder="all"
                value={overlap.max ?? ""}
                onChange={(e) => onChange({ ...overlap, max: numberOrUndefined(e.target.value) })}
              />
            </label>
            {overlap.max !== undefined && (
              <label className={labelClass}>
                Which
                <select
                  className={`${selectClass} font-normal`}
                  value={overlap.pick ?? "first"}
                  onChange={(e) => onChange({ ...overlap, pick: e.target.value as OverlapSettings["pick"] })}
                >
                  <option value="first">The first ones</option>
                  <option value="random">A random draw (the same for every coder)</option>
                </select>
              </label>
            )}
          </>
        )}
      </div>
      {on && group && units === 0 && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          Group {group.name} has no {OVERLAP_SET} units yet: add them (a set named {OVERLAP_SET}) on the Units page.
        </p>
      )}
      {on && units > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {Math.min(units, overlap.max ?? units)} of the {units} {OVERLAP_SET} units of group {group!.name}
          {overlap.expect !== undefined && units < overlap.expect ? ` (fewer than the ${overlap.expect} recommended)` : ""}.
        </p>
      )}
    </div>
  );
}

type Placement = PracticeSettings["placement"];

/** Where a group's practice or gold units go: off, or a placement. */
function PlacementSelect({
  value,
  canSpread,
  firstLabel,
  onChange,
}: {
  value: Placement | undefined;
  canSpread: boolean;
  firstLabel: string;
  onChange: (placement: Placement | undefined) => void;
}) {
  return (
    <select
      className={`${selectClass} w-fit font-normal`}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : (e.target.value as Placement))}
    >
      <option value="">None</option>
      <option value="first">{firstLabel}</option>
      <option value="spread" disabled={!canSpread}>
        Spread through the coder&apos;s units{canSpread ? "" : " (needs max units per coder)"}
      </option>
      <option value="rate">At a rate: about one in every few units</option>
      <option value="last">Last, after the coder&apos;s own units</option>
    </select>
  );
}

/**
 * At a rate (contracts RateSettings): about one special unit in `every`,
 * at random per coder; what is left when the coder's own units run out
 * comes at the end or is dropped.
 */
function RateFields({
  value,
  onChange,
}: {
  value: { every?: number; rest?: "end" | "drop" };
  onChange: (rate: { every?: number; rest?: "end" | "drop" }) => void;
}) {
  return (
    <>
      <label className={labelClass}>
        One in
        <Input
          type="number"
          min={2}
          className="h-8 w-20 text-xs font-normal"
          placeholder={String(DEFAULT_RATE)}
          value={value.every ?? ""}
          onChange={(e) => onChange({ every: numberOrUndefined(e.target.value) })}
        />
      </label>
      <label className={labelClass}>
        Left when a coder&apos;s own units run out
        <select
          className={`${selectClass} w-fit font-normal`}
          value={value.rest ?? "end"}
          onChange={(e) => onChange({ rest: e.target.value as "end" | "drop" })}
        >
          <option value="end">At the end: every coder codes them all</option>
          <option value="drop">Dropped: coders code the ones they happened to get</option>
        </select>
      </label>
    </>
  );
}

/** Checkboxes for the loop's checkable questions, with the answer column each needs. */
function CheckedQuestions({
  checkable,
  value,
  column,
  onChange,
}: {
  checkable: AnswerKeyQuestion[];
  value: string[];
  column: (question: string) => string;
  onChange: (questions: string[]) => void;
}) {
  if (checkable.length === 0)
    return <p className="text-[11px] text-muted-foreground">The loop has no questions that can be checked (choices, numbers or confirm).</p>;
  return (
    <div className="flex flex-col gap-1">
      {checkable.map(({ name: q }) => (
        <label key={q} className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={value.includes(q)}
            onChange={(e) =>
              onChange(e.target.checked ? checkable.map((c) => c.name).filter((c) => c === q || value.includes(c)) : value.filter((c) => c !== q))
            }
          />
          <span className="font-medium">{q}</span>
          <span className="text-muted-foreground">
            answer in column <code>{column(q)}</code>
          </span>
        </label>
      ))}
    </div>
  );
}

/** A note on the group's units of a special set: none yet, or how many. */
function SpecialSetNote({ group, set, what }: { group: SetGroupResponse | undefined; set: string; what: string }) {
  if (!group) return null;
  const units = group.sets.find((s) => s.name === set)?.unitIds.length ?? 0;
  return units === 0 ? (
    <p className="text-[11px] text-amber-700 dark:text-amber-400">
      Group {group.name} has no {set} units yet: add them (a set named {set}) on the Units page.
    </p>
  ) : (
    <p className="text-[11px] text-muted-foreground">
      {units} {what} of group {group.name}.
    </p>
  );
}

/**
 * Practice units: the group's `_practice` units; for the questions checked,
 * coders are told after answering when they were wrong
 * (docs/plans/special-sets.md §2).
 */
function PracticeEditor({
  practice,
  group,
  checkable,
  answerKey,
  canSpread,
  onChange,
}: {
  practice: PracticeSettings | undefined;
  group: SetGroupResponse | undefined;
  checkable: AnswerKeyQuestion[];
  answerKey?: AnswerKeyContext;
  canSpread: boolean;
  onChange: (practice: PracticeSettings | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className={labelClass}>
        <span className="flex items-center gap-1.5">Practice: units with feedback when a coder answers wrong</span>
        <PlacementSelect
          value={practice?.placement}
          canSpread={canSpread}
          firstLabel="First, a practice round (recommended)"
          onChange={(placement) => onChange(placement ? { ...practice, placement } : undefined)}
        />
      </label>
      {practice?.placement === "rate" && (
        <div className="flex flex-wrap items-end gap-3">
          <RateFields value={practice} onChange={(rate) => onChange({ ...practice, ...rate })} />
        </div>
      )}
      {practice && (
        <div className="flex flex-col gap-2 border-l-2 border-border pl-3">
          <span className="text-xs font-semibold">Questions with feedback</span>
          <CheckedQuestions
            checkable={checkable}
            value={practice.questions ?? []}
            column={practiceColumn}
            onChange={(questions) => {
              const next: PracticeSettings = { ...practice, questions };
              if (questions.length === 0) delete next.questions;
              onChange(next);
            }}
          />
          {(practice.questions?.length ?? 0) > 0 && (
            <label className={labelClass}>
              Message when wrong (optional)
              <Input
                className="h-8 text-xs font-normal"
                placeholder="Default: the expected answer"
                value={practice.message ?? ""}
                onChange={(e) => {
                  const next: PracticeSettings = { ...practice, message: e.target.value };
                  if (!e.target.value) delete next.message;
                  onChange(next);
                }}
              />
              <span className="text-[11px] font-normal text-muted-foreground">
                May use $unit and $var. A unit&apos;s own message, per question, goes in the column{" "}
                <code>{practiceMessageColumn("question")}</code>. Practice units come with their answers (checked in the coder&apos;s browser, as
                each question is answered); $unit._practice tells a layout it shows a practice unit.
              </span>
            </label>
          )}
          {(practice.questions?.length ?? 0) > 0 && (
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={practice.retry !== false}
                onChange={(e) => {
                  const next: PracticeSettings = { ...practice, retry: false };
                  if (e.target.checked) delete next.retry;
                  onChange(next);
                }}
              />
              <span>
                Answer again until right
                <span className="block text-[11px] text-muted-foreground">
                  Off: coders see the message and may go on. Either way, how many tries each question took is in the export.
                </span>
              </span>
            </label>
          )}
          <SpecialSetNote group={group} set={PRACTICE_SET} what="practice units" />
          {answerKey && group && (practice.questions?.length ?? 0) > 0 && (
            <RightAnswersButton
              context={answerKey}
              group={group.name}
              set={PRACTICE_SET}
              what="practice"
              questions={checkable.filter((q) => practice.questions!.includes(q.name))}
              column={practiceColumn}
              messageColumn={practiceMessageColumn}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Gold units: the group's `_gold` units, checked silently; with health, too
 * many wrong answers end the session at a screen-out
 * (docs/plans/special-sets.md §2).
 */
function GoldEditor({
  gold,
  group,
  checkable,
  answerKey,
  screenouts,
  canSpread,
  onChange,
}: {
  gold: GoldSettings | undefined;
  group: SetGroupResponse | undefined;
  checkable: AnswerKeyQuestion[];
  answerKey?: AnswerKeyContext;
  screenouts: string[];
  canSpread: boolean;
  onChange: (gold: GoldSettings | undefined) => void;
}) {
  const health = gold?.health;
  const setHealth = (patch: Partial<NonNullable<GoldSettings["health"]>>) => gold && health && onChange({ ...gold, health: { ...health, ...patch } });
  return (
    <div className="flex flex-col gap-2">
      <label className={labelClass}>
        <span className="flex items-center gap-1.5">Gold: units with a known answer, checked silently</span>
        <PlacementSelect
          value={gold?.placement}
          canSpread={canSpread}
          firstLabel="First, before the coder's own units"
          onChange={(placement) => onChange(placement ? { questions: [], ...gold, placement } : undefined)}
        />
      </label>
      {gold?.placement === "rate" && (
        <div className="flex flex-wrap items-end gap-3">
          <RateFields value={gold} onChange={(rate) => onChange({ ...gold, ...rate })} />
        </div>
      )}
      {gold && (
        <div className="flex flex-col gap-2 border-l-2 border-border pl-3">
          <span className="text-xs font-semibold">Questions checked</span>
          <CheckedQuestions checkable={checkable} value={gold.questions} column={goldColumn} onChange={(questions) => onChange({ ...gold, questions })} />
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={health !== undefined}
              onChange={(e) => {
                const next = { ...gold };
                if (e.target.checked) next.health = { start: 5, wrong: -1, right: 0, end: screenouts[0] ?? "" };
                else delete next.health;
                onChange(next);
              }}
            />
            End the session when a coder answers too many wrong
          </label>
          {health && (
            <div className="flex flex-wrap items-end gap-3">
              <label className={labelClass}>
                Health at the start
                <Input
                  type="number"
                  min={1}
                  className="h-8 w-24 text-xs font-normal"
                  value={health.start}
                  onChange={(e) => setHealth({ start: Number(e.target.value) })}
                />
              </label>
              <label className={labelClass}>
                Per wrong answer
                <Input
                  type="number"
                  max={-0.1}
                  step="any"
                  className="h-8 w-24 text-xs font-normal"
                  value={health.wrong}
                  onChange={(e) => setHealth({ wrong: Number(e.target.value) })}
                />
              </label>
              <label className={labelClass}>
                Per right answer
                <Input
                  type="number"
                  min={0}
                  step="any"
                  className="h-8 w-24 text-xs font-normal"
                  value={health.right ?? 0}
                  onChange={(e) => setHealth({ right: Number(e.target.value) || undefined })}
                />
              </label>
              <label className={labelClass}>
                At 0, end at
                <select className={`${selectClass} font-normal`} value={health.end} onChange={(e) => setHealth({ end: e.target.value })}>
                  {!screenouts.includes(health.end) && <option value={health.end}>{health.end || "(add an end item that screens out)"}</option>}
                  {screenouts.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {health && health.wrong < 0 && (
            <p className="text-[11px] text-muted-foreground">
              Health never goes above its start. With these numbers a coder can answer {Math.ceil(health.start / -health.wrong) - 1} gold
              units wrong in a row; the next one ends their session.
            </p>
          )}
          <SpecialSetNote group={group} set={GOLD_SET} what="gold units" />
          {answerKey && group && gold.questions.length > 0 && (
            <RightAnswersButton
              context={answerKey}
              group={group.name}
              set={GOLD_SET}
              what="gold"
              questions={checkable.filter((q) => gold.questions.includes(q.name))}
              column={goldColumn}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Opens the answer-key dialog: the right answers of a group's gold or practice units. */
function RightAnswersButton({
  context,
  ...props
}: {
  context: AnswerKeyContext;
  group: string;
  set: string;
  what: string;
  questions: AnswerKeyQuestion[];
  column: (question: string) => string;
  messageColumn?: (question: string) => string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setOpen(true)}>
        {props.what === "gold" ? "Create gold values…" : "Write practice answers…"}
      </Button>
      {open && <AnswerKeyDialog client={context.client} layout={context.layout} {...props} onClose={() => setOpen(false)} />}
    </>
  );
}
