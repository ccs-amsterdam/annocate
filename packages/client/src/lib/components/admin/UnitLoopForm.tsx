import { useState, type ReactNode } from "react";
import { Plus, Split, Trash2, X } from "lucide-react";
import { cn } from "cn";
import {
  ALL_UNITS_UNITSET,
  supportsAgreement,
  type AnyVariableType,
  type CodebookItem,
  type CodebookValidationIssue,
  type Overlap,
  type SharedBranch,
  type UnitBranch,
  type UnitLayout,
  type UnitLoopItem,
  type UnitMode,
  type UnitsetResponse,
} from "@annotinder/contracts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TemplateCodeEditor } from "./jsonEditor/TemplateCodeEditor";
import { ConditionEditor } from "./ConditionEditor";
import { IssueList } from "./IssueList";
import { issuesAt } from "./issues";

const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-xs";
const labelClass = "flex flex-col gap-1 text-xs font-semibold";

/** The loop's questions an agreement rule can compare (contracts `supportsAgreement`). */
function agreementQuestions(items: CodebookItem[]): string[] {
  return items.flatMap((i) => {
    if (i.type === "condition") return agreementQuestions(i.children as CodebookItem[]);
    return "variable" in i && supportsAgreement(i.variable) ? [i.name] : [];
  });
}

const MODES: { value: UnitMode; label: string; help: string }[] = [
  { value: "all", label: "All units", help: "Every coder codes every unit of the set." },
  {
    value: "shared",
    label: "Units shared among coders",
    help: "A queue: each unit goes to coders until enough coded it (or agree), and then to no one else.",
  },
  {
    value: "sets",
    label: "One set per coder",
    help: "Each coder gets one of these sets: the one with the fewest coders. Coders who stop count for their set for 24 hours.",
  },
  {
    value: "invitation",
    label: "The invitation's units",
    help: "Each coder gets the unitset of their invitation. Set it per invitation, or divide units over coders, on the Invitations page.",
  },
];

/** A branch in another mode, keeping its condition, overlap and unitset. */
function switchMode(branch: UnitBranch, mode: UnitMode): UnitBranch {
  const common = { ...(branch.when ? { when: branch.when } : {}), ...(branch.overlap ? { overlap: branch.overlap } : {}) };
  const unitset = "unitset" in branch ? branch.unitset : ALL_UNITS_UNITSET;
  switch (mode) {
    case "all":
      return { ...common, mode, unitset };
    case "shared":
      return { ...common, mode, unitset, until: { coders: 1 }, maxCoders: 1 };
    case "sets":
      return { ...common, mode, unitsets: [] };
    case "invitation":
      return { ...common, mode };
  }
}

const defaultBranch = (): UnitBranch => ({ mode: "all", unitset: ALL_UNITS_UNITSET });

/** A branch without its condition (the only branch, or the last: "otherwise"). */
function withoutWhen(branch: UnitBranch): UnitBranch {
  const next = { ...branch };
  delete next.when;
  return next;
}

type LoopTab = "units" | "layout";

/**
 * Edits a unit_loop, in two tabs: which units coders get (contracts
 * unitLoop.ts: per branch a mode and an optional overlap set; with
 * branches, per branch a condition on coder-level questions; the order),
 * and how a unit is shown (the template and its constants).
 */
export function UnitLoopForm({
  loop,
  unitsets,
  unitFields,
  coderQuestions,
  validationIssues,
  readOnly = false,
  onChange,
}: {
  loop: UnitLoopItem;
  unitsets: UnitsetResponse[];
  /** The job's unit fields, for completions in the template. */
  unitFields: string[];
  /** Coder-level questions before the loop: what branch conditions and unitset names may use. */
  coderQuestions: { name: string; variable: AnyVariableType }[];
  validationIssues: CodebookValidationIssue[];
  readOnly?: boolean;
  onChange: (loop: UnitLoopItem) => void;
}) {
  const [tab, setTab] = useState<LoopTab>("units");
  const tabs: { value: LoopTab; label: string; issues: CodebookValidationIssue[] }[] = [
    { value: "units", label: "Units", issues: [...issuesAt(validationIssues, "units"), ...issuesAt(validationIssues, "order")] },
    { value: "layout", label: "Layout", issues: issuesAt(validationIssues, "layout") },
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
        <UnitsTab loop={loop} unitsets={unitsets} coderQuestions={coderQuestions} validationIssues={validationIssues} onChange={onChange} />
      ) : (
        <LayoutTab
          loop={loop}
          unitFields={unitFields}
          questions={coderQuestions.map((q) => q.name)}
          issues={issuesAt(validationIssues, "layout")}
          readOnly={readOnly}
          onChange={onChange}
        />
      )}
    </div>
  );
}

/** A titled part of a tab, with a line of help. */
function Section({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-xs font-semibold">{title}</h3>
        {help && <p className="text-[11px] text-muted-foreground">{help}</p>}
      </div>
      {children}
    </section>
  );
}

/** Which units coders get: the branch (or branches), and the order. */
function UnitsTab({
  loop,
  unitsets,
  coderQuestions,
  validationIssues,
  onChange,
}: {
  loop: UnitLoopItem;
  unitsets: UnitsetResponse[];
  coderQuestions: { name: string; variable: AnyVariableType }[];
  validationIssues: CodebookValidationIssue[];
  onChange: (loop: UnitLoopItem) => void;
}) {
  const branches = loop.units?.length ? loop.units : [defaultBranch()];
  const agreeable = agreementQuestions(loop.children as CodebookItem[]);
  const setBranches = (units: UnitBranch[]) => onChange({ ...loop, units });
  const setBranch = (b: number, branch: UnitBranch) => setBranches(branches.map((x, i) => (i === b ? branch : x)));

  // One branch without a condition: just its units. Several: every branch
  // but the last has a condition ("if", "else if"); the last is "otherwise"
  // (an older codebook may lack it: then coders matching no branch get no units).
  const multi = branches.length > 1 || branches[0].when !== undefined;
  const hasOtherwise = branches[branches.length - 1].when === undefined;
  const branchLabel = (b: number) => (branches[b].when === undefined ? "Otherwise" : b === 0 ? "If" : "Else if");

  const startBranches = () => setBranches([{ ...defaultBranch(), when: { script: "true" } }, ...branches]);
  const addBranch = () => {
    const added: UnitBranch = { ...defaultBranch(), when: { script: "true" } };
    setBranches(hasOtherwise ? [...branches.slice(0, -1), added, branches[branches.length - 1]] : [...branches, added]);
  };
  const removeBranch = (b: number) => {
    const rest = branches.filter((_, i) => i !== b);
    // Back to one branch: it has no condition.
    setBranches(rest.length === 1 ? [withoutWhen(rest[0])] : rest);
  };

  const editor = (b: number) => (
    <BranchEditor
      branch={branches[b]}
      unitsets={unitsets}
      agreeable={agreeable}
      issues={issuesAt(validationIssues, "units", b)}
      onChange={(branch) => setBranch(b, branch)}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <datalist id="unitset-names">
        {unitsets.map((u) => (
          <option key={u.id} value={u.name} />
        ))}
      </datalist>

      {multi ? (
        <Section title="Coder groups" help="The first group a coder is in decides their units (and keeps deciding them).">
          {branches.map((branch, b) => (
            <div key={b} className="flex flex-col gap-3 rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">{branchLabel(b)}</span>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeBranch(b)} aria-label="Remove group">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {branch.when && (
                <ConditionEditor
                  condition={branch.when}
                  onChange={(when) => setBranch(b, { ...branch, when })}
                  questions={coderQuestions}
                  issues={issuesAt(validationIssues, "units", b, "when")}
                />
              )}
              {editor(b)}
            </div>
          ))}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={addBranch}>
              <Plus className="h-3.5 w-3.5" /> Group
            </Button>
            {!hasOtherwise && (
              <Button type="button" variant="outline" size="sm" onClick={() => setBranches([...branches, defaultBranch()])}>
                <Plus className="h-3.5 w-3.5" /> Otherwise
              </Button>
            )}
          </div>
        </Section>
      ) : (
        editor(0)
      )}

      <Section title="Order">
        <select
          className={`${selectClass} w-fit`}
          value={loop.order ?? "sequential"}
          onChange={(e) => onChange({ ...loop, order: e.target.value as UnitLoopItem["order"] })}
        >
          <option value="sequential">In unitset order</option>
          <option value="random">Random (each coder their own order)</option>
        </select>
      </Section>

      {!multi && (
        <button
          type="button"
          onClick={startBranches}
          className="flex w-fit cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Split className="h-3.5 w-3.5" /> Different units for different coder groups…
        </button>
      )}
    </div>
  );
}

/** How a unit is shown: the markdown template, and the constants it can use. */
function LayoutTab({
  loop,
  unitFields,
  questions,
  issues,
  readOnly,
  onChange,
}: {
  loop: UnitLoopItem;
  unitFields: string[];
  questions: string[];
  issues: CodebookValidationIssue[];
  readOnly: boolean;
  onChange: (loop: UnitLoopItem) => void;
}) {
  const layout = loop.layout ?? { template: "" };
  const constants = Object.entries(layout.constants ?? {});
  const names = { fields: unitFields, constants: constants.map(([n]) => n), questions };
  const setLayout = (next: Partial<UnitLayout>) => onChange({ ...loop, layout: { ...layout, ...next } });
  const setConstants = (entries: [string, string][]) => {
    const next = { ...layout };
    if (entries.length === 0) delete next.constants;
    else next.constants = Object.fromEntries(entries);
    onChange({ ...loop, layout: next });
  };

  return (
    <div className="flex flex-col gap-5">
      <Section
        title="Template"
        help="Markdown. Insert values with $unit.<field>, $const.<name> or $var.<question>.value; type $ for suggestions."
      >
        <div
          className={cn(
            "overflow-hidden rounded-md border",
            issues.some((i) => !i.warning && !i.path.includes("constants")) ? "border-destructive" : "border-input",
          )}
        >
          <TemplateCodeEditor value={layout.template} names={names} readOnly={readOnly} onChange={(template) => setLayout({ template })} />
        </div>
        <IssueList issues={issues} />
      </Section>

      <Section
        title="Constants"
        help="Texts the template uses as $const.<name>, e.g. an introduction per experimental condition. They are part of the codebook version."
      >
        {constants.map(([name, value], i) => (
          <div key={i} className="flex items-start gap-2">
            <Input
              aria-label="Constant name"
              className="h-8 w-40 font-mono text-xs"
              value={name}
              placeholder="name"
              onChange={(e) => {
                const renamed = e.target.value;
                // A name another constant has would merge them: not taken.
                if (constants.some(([n], j) => j !== i && n === renamed)) return;
                setConstants(constants.map((c, j) => (j === i ? [renamed, c[1]] : c)));
              }}
            />
            <Textarea
              aria-label={`Value of ${name}`}
              className="field-sizing-content max-h-40 min-h-8 flex-1 text-xs"
              rows={1}
              value={value}
              onChange={(e) => setConstants(constants.map((c, j) => (j === i ? [c[0], e.target.value] : c)))}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${name}`}
              onClick={() => setConstants(constants.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => {
            let n = constants.length + 1;
            while (constants.some(([c]) => c === `const_${n}`)) n++;
            setConstants([...constants, [`const_${n}`, ""]]);
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Constant
        </Button>
      </Section>
    </div>
  );
}

/** One branch's units: its mode and settings, and the overlap. */
function BranchEditor({
  branch,
  unitsets,
  agreeable,
  issues,
  onChange,
}: {
  branch: UnitBranch;
  unitsets: UnitsetResponse[];
  agreeable: string[];
  issues: CodebookValidationIssue[];
  onChange: (branch: UnitBranch) => void;
}) {
  const mode = MODES.find((m) => m.value === branch.mode)!;
  return (
    <div className="flex flex-col gap-3">
      <label className={labelClass}>
        Who codes which units
        <select className={`${selectClass} w-fit`} value={branch.mode} onChange={(e) => onChange(switchMode(branch, e.target.value as UnitMode))}>
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <span className="text-[11px] font-normal text-muted-foreground">{mode.help}</span>
      </label>

      {(branch.mode === "all" || branch.mode === "shared") && (
        <label className={labelClass}>
          Unitset
          <UnitsetInput value={branch.unitset} onChange={(unitset) => onChange({ ...branch, unitset })} />
        </label>
      )}
      {branch.mode === "shared" && <SharedSettings branch={branch} agreeable={agreeable} onChange={onChange} />}
      {branch.mode === "sets" && <SetsPicker value={branch.unitsets} unitsets={unitsets} onChange={(names) => onChange({ ...branch, unitsets: names })} />}

      <OverlapEditor
        overlap={branch.overlap}
        canSpread={branch.mode !== "shared" || branch.maxUnits !== undefined}
        onChange={(overlap) => {
          const next = { ...branch, overlap };
          if (!overlap) delete next.overlap;
          onChange(next);
        }}
      />

      <IssueList issues={issues.filter((issue) => !issue.path.includes("when"))} />
    </div>
  );
}

const numberOrUndefined = (v: string) => (v === "" ? undefined : Number(v));

function SharedSettings({ branch, agreeable, onChange }: { branch: SharedBranch; agreeable: string[]; onChange: (b: UnitBranch) => void }) {
  const agree = "agree" in branch.until;
  const needed = agree && "agree" in branch.until ? branch.until.agree : "coders" in branch.until ? branch.until.coders : 1;
  return (
    <div className="flex flex-wrap items-end gap-3 text-xs">
      <label className={labelClass}>
        Each unit is coded until
        <div className="flex items-center gap-1.5 font-normal">
          <Input
            type="number"
            min={agree ? 2 : 1}
            className="h-8 w-16 text-xs"
            value={needed}
            onChange={(e) => {
              const n = Number(e.target.value) || 1;
              onChange({ ...branch, until: agree && "on" in branch.until ? { agree: n, on: branch.until.on } : { coders: n } });
            }}
          />
          <select
            className={selectClass}
            value={agree ? "agree" : "coders"}
            onChange={(e) =>
              onChange({
                ...branch,
                until: e.target.value === "agree" ? { agree: Math.max(2, needed), on: agreeable[0] ?? "" } : { coders: needed },
                ...(e.target.value === "agree" && branch.maxCoders === undefined ? { maxCoders: Math.max(3, needed + 1) } : {}),
              })
            }
          >
            <option value="coders">coders coded it</option>
            <option value="agree">coders agree on</option>
          </select>
          {agree && "on" in branch.until && (
            <select className={selectClass} value={branch.until.on} onChange={(e) => onChange({ ...branch, until: { ...branch.until, on: e.target.value } as SharedBranch["until"] })}>
              {!agreeable.includes(branch.until.on) && <option value={branch.until.on}>{branch.until.on || "(choose a question)"}</option>}
              {agreeable.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          )}
        </div>
      </label>
      <label className={labelClass}>
        Max coders per unit
        <Input
          type="number"
          min={1}
          className="h-8 w-24 text-xs"
          value={branch.maxCoders ?? ""}
          placeholder={agree ? "required" : "no limit"}
          onChange={(e) => onChange({ ...branch, maxCoders: numberOrUndefined(e.target.value) })}
        />
      </label>
      <label className={labelClass}>
        Max units per coder
        <Input
          type="number"
          min={1}
          className="h-8 w-24 text-xs"
          value={branch.maxUnits ?? ""}
          placeholder="no limit"
          onChange={(e) => onChange({ ...branch, maxUnits: numberOrUndefined(e.target.value) })}
        />
      </label>
      <label className={labelClass}>
        Priority
        <select
          className={selectClass}
          value={branch.priority ?? "cover"}
          onChange={(e) => onChange({ ...branch, priority: e.target.value as SharedBranch["priority"] })}
        >
          <option value="cover">Cover all units first</option>
          <option value="saturate">Finish units first</option>
        </select>
      </label>
    </div>
  );
}

/** The sets of "one set per coder": the job's unitsets as checkboxes, plus "all starting with". */
function SetsPicker({ value, unitsets, onChange }: { value: string[]; unitsets: UnitsetResponse[]; onChange: (names: string[]) => void }) {
  const names = [...unitsets.map((u) => u.name), ...value.filter((n) => !unitsets.some((u) => u.name === n))];
  const toggle = (name: string) => onChange(value.includes(name) ? value.filter((n) => n !== name) : [...value, name]);
  const addPrefix = () => {
    const prefix = window.prompt("Add all unitsets whose name starts with:");
    if (!prefix) return;
    onChange([...value, ...unitsets.map((u) => u.name).filter((n) => n.startsWith(prefix) && !value.includes(n))]);
  };
  return (
    <div className={labelClass}>
      Sets ({value.length})
      {names.length === 0 ? (
        <p className="text-[11px] font-normal text-muted-foreground">This job has no unitsets yet: make them on the Units page.</p>
      ) : (
        <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto font-normal">
          {names.map((name) => {
            const known = unitsets.some((u) => u.name === name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggle(name)}
                title={known ? undefined : "This job has no unitset with this name"}
                className={`rounded border px-1.5 py-0.5 text-[11px] ${
                  !known
                    ? "border-destructive text-destructive"
                    : value.includes(name)
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground"
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}
      <Button type="button" variant="ghost" size="sm" className="self-start text-xs font-normal" onClick={addPrefix}>
        <Plus className="h-3.5 w-3.5" /> All starting with…
      </Button>
    </div>
  );
}

function OverlapEditor({
  overlap,
  canSpread,
  onChange,
}: {
  overlap: Overlap | undefined;
  /** Spreading needs the number of units a coder gets: not known in a shared queue without max units per coder. */
  canSpread: boolean;
  onChange: (overlap: Overlap | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-xs font-semibold">
        <input
          type="checkbox"
          checked={overlap !== undefined}
          onChange={(e) => onChange(e.target.checked ? { unitset: "overlap" } : undefined)}
        />
        Overlap: a set every coder codes too
      </label>
      {overlap && (
        <div className="flex flex-wrap items-end gap-3 pl-6">
          <label className={labelClass}>
            Unitset
            <UnitsetInput value={overlap.unitset} allowAll={false} onChange={(unitset) => onChange({ ...overlap, unitset })} />
          </label>
          <label className={labelClass}>
            Placed
            <select
              className={selectClass}
              value={overlap.placement ?? "before"}
              onChange={(e) => onChange({ ...overlap, placement: e.target.value as Overlap["placement"] })}
            >
              <option value="before">Before the coder&apos;s units</option>
              <option value="after">After the coder&apos;s units</option>
              <option value="spread" disabled={!canSpread}>
                Spread through them{canSpread ? "" : " (needs max units per coder)"}
              </option>
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

/**
 * A unitset name, with the job's unitsets as suggestions. Empty means every
 * unit of the job (stored as `__all__`), so the list shows all unitsets
 * while it is empty. Names may contain `$var` references.
 */
function UnitsetInput({ value, onChange, allowAll = true }: { value: string; onChange: (value: string) => void; allowAll?: boolean }) {
  const all = allowAll && value === ALL_UNITS_UNITSET;
  return (
    <div className="relative w-64 font-normal">
      <Input
        list="unitset-names"
        className="h-8 pr-7 text-xs"
        placeholder={allowAll ? "All units" : "unitset"}
        value={all ? "" : value}
        onChange={(e) => onChange(e.target.value || (allowAll ? ALL_UNITS_UNITSET : ""))}
      />
      {allowAll && !all && (
        <button
          type="button"
          title="Use all units"
          aria-label="Use all units"
          onClick={() => onChange(ALL_UNITS_UNITSET)}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
