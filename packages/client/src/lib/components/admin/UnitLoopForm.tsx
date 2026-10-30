import { useId, useState, type ReactNode } from "react";
import { Code, Plus, Split, Trash2 } from "lucide-react";
import { cn } from "cn";
import {
  OVERLAP_SET,
  supportsAgreement,
  type AnyVariableType,
  type AssignBranch,
  type CodebookItem,
  type CodebookValidationIssue,
  type OverlapSettings,
  type SetGroupResponse,
  type SetRef,
  type SharedBranch,
  type UnitBranch,
  type UnitLayout,
  type UnitLoopItem,
  type UnitMode,
} from "@annotinder/contracts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLoopTab, type LoopTab } from "./codebookEditor/loopTab";
import { TemplateCodeEditor, type TemplateEditorApi } from "./jsonEditor/TemplateCodeEditor";
import { ConditionDialog, TemplateInsertMenu } from "./TemplateInsertMenu";
import { ConditionEditor } from "./ConditionEditor";
import { IssueList } from "./IssueList";
import { issuesAt } from "./issues";
import { HelpButton } from "../../help/HelpButton";
import { guessSimpleLayout, parseSimpleLayout, simpleTemplate } from "../../codebook/simpleLayout";
import { LayoutDesigner } from "./LayoutDesigner";

const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-xs";
const labelClass = "flex flex-col gap-1 text-xs font-semibold";

/** The names of a loop's questions, in order (through conditions). */
function questionNames(items: CodebookItem[]): string[] {
  return items.flatMap((i) => (i.type === "condition" ? questionNames(i.children as CodebookItem[]) : "name" in i ? [i.name] : []));
}

/** A loop's questions with their answer types (through conditions). */
function questionsOf(items: CodebookItem[]): { name: string; variable: AnyVariableType }[] {
  return items.flatMap((i) => (i.type === "condition" ? questionsOf(i.children as CodebookItem[]) : "variable" in i ? [{ name: i.name, variable: i.variable }] : []));
}

/** The loop's questions an agreement rule can compare (contracts `supportsAgreement`). */
function agreementQuestions(items: CodebookItem[]): string[] {
  return items.flatMap((i) => {
    if (i.type === "condition") return agreementQuestions(i.children as CodebookItem[]);
    return "variable" in i && supportsAgreement(i.variable) ? [i.name] : [];
  });
}

/** The modes, named as in the setup wizard (admin/setupRecipe.ts `DISTRIBUTIONS`). */
const MODES: { value: UnitMode; label: string; help: string }[] = [
  { value: "all", label: "Everyone codes everything", help: "Every coder codes every unit (of the job, or of one set)." },
  {
    value: "shared",
    label: "Crowd coding",
    help: "A shared queue: each unit goes to coders until enough coded it (or agree), and then to no one else.",
  },
  {
    value: "assign",
    label: "Assign sets",
    help: "Each coder gets one set of a group: drawn here, or named by their link, URL, participant id or login.",
  },
];

/** A branch in another mode, keeping its condition (and set, where the mode has one). */
function switchMode(branch: UnitBranch, mode: UnitMode, groups: SetGroupResponse[]): UnitBranch {
  const common = branch.when ? { when: branch.when } : {};
  const set = branch.mode !== "assign" && branch.set ? { set: branch.set } : {};
  switch (mode) {
    case "all":
      return { ...common, ...set, mode };
    case "shared":
      return { ...common, ...set, mode, until: { coders: 1 }, maxCoders: 1 };
    case "assign": {
      const group = branch.mode === "assign" ? branch.group : branch.set?.group ?? groups[0]?.name ?? "";
      // The overlap is chosen on purpose (first, last, spread or disabled): left open, so validation asks for it.
      return { ...common, mode, group, from: { draw: "balanced" } } as AssignBranch;
    }
  }
}

const defaultBranch = (): UnitBranch => ({ mode: "all" });

/** A loop whose distribution isn't set: what that means, and the choice. */
function UnsetUnits({ onChoose }: { onChoose: (mode: UnitMode) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-md border border-amber-500/60 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
        Which units coders get isn't set yet. Choose how they are handed out: the form then shows the settings. The codebook
        can be saved like this, but not previewed or published.
      </p>
      <div className={labelClass}>
        <span className="flex items-center gap-1.5">
          <label htmlFor={id}>Who codes which units</label>
          <HelpButton topic="unit-distribution" label="Help: unit distribution" />
        </span>
        <select
          id={id}
          className={`${selectClass} w-fit border-amber-500`}
          value=""
          onChange={(e) => onChoose(e.target.value as UnitMode)}
        >
          <option value="" disabled>
            Choose...
          </option>
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <ul className="list-disc pl-4 text-[11px] font-normal text-muted-foreground">
          {MODES.map((m) => (
            <li key={m.value}>
              <span className="font-medium text-foreground">{m.label}:</span> {m.help}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** A branch without its condition (the only branch, or the last: "otherwise"). */
function withoutWhen(branch: UnitBranch): UnitBranch {
  const next = { ...branch };
  delete next.when;
  return next;
}


/**
 * Edits a unit_loop, in two tabs: how a unit is shown (the template and
 * its snippets), and which units coders get (contracts
 * unitLoop.ts: per branch a mode and an optional overlap set; with
 * branches, per branch a condition on coder-level questions; the order),
 * and how a unit is shown (the template and its snippets).
 */
export function UnitLoopForm({
  loop,
  groups,
  setParams = new Map(),
  unitFields,
  coderQuestions,
  validationIssues,
  readOnly = false,
  onChange,
}: {
  loop: UnitLoopItem;
  /** The job's set groups. */
  groups: SetGroupResponse[];
  /** The codebook's set-typed session parameters (name -> group): where an assigned set can come from. */
  setParams?: Map<string, string>;
  /** The job's unit fields, for completions in the template. */
  unitFields: string[];
  /** Coder-level questions before the loop: what branch conditions may use. */
  coderQuestions: { name: string; variable: AnyVariableType }[];
  validationIssues: CodebookValidationIssue[];
  readOnly?: boolean;
  onChange: (loop: UnitLoopItem) => void;
}) {
  const [tab, setTab] = useLoopTab();
  const tabs: { value: LoopTab; label: string; issues: CodebookValidationIssue[] }[] = [
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
          groups={groups}
          setParams={setParams}
          coderQuestions={coderQuestions}
          validationIssues={validationIssues}
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

/** Which units coders get: the branch (or branches), and the order. */
function UnitsTab({
  loop,
  groups,
  setParams,
  coderQuestions,
  validationIssues,
  onChange,
}: {
  loop: UnitLoopItem;
  groups: SetGroupResponse[];
  setParams: Map<string, string>;
  coderQuestions: { name: string; variable: AnyVariableType }[];
  validationIssues: CodebookValidationIssue[];
  onChange: (loop: UnitLoopItem) => void;
}) {
  const agreeable = agreementQuestions(loop.children as CodebookItem[]);
  const setBranches = (units: UnitBranch[]) => onChange({ ...loop, units });
  // Not set yet (the setup wizard's "decide later", or a new loop): choose how first.
  if (!loop.units?.length) return <UnsetUnits onChoose={(mode) => setBranches([switchMode(defaultBranch(), mode, groups)])} />;
  const branches = loop.units;
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
      groups={groups}
      setParams={setParams}
      agreeable={agreeable}
      issues={issuesAt(validationIssues, "units", b)}
      onChange={(branch) => setBranch(b, branch)}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      {multi ? (
        <Section title="Coder groups" help="The first group a coder is in decides their units (and keeps deciding them)." topic="coder-groups">
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
  issues: CodebookValidationIssue[];
  readOnly: boolean;
  onChange: (loop: UnitLoopItem) => void;
}) {
  const layout = loop.layout ?? { template: "" };
  const snippets = Object.entries(layout.snippets ?? {});
  const loopQuestions = questionNames(loop.children as CodebookItem[]);
  // `::: if` in the layout may use coder-level questions, and (inside `::: from`) the loop's own.
  const conditionQuestions = [...coderQuestions, ...questionsOf(loop.children as CodebookItem[])];
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
                setLayout({ template: simpleTemplate(guessSimpleLayout(unitFields)) });
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
  );
}

/** One branch's units: its mode and settings, and the overlap. */
function BranchEditor({
  branch,
  groups,
  setParams,
  agreeable,
  issues,
  onChange,
}: {
  branch: UnitBranch;
  groups: SetGroupResponse[];
  setParams: Map<string, string>;
  agreeable: string[];
  issues: CodebookValidationIssue[];
  onChange: (branch: UnitBranch) => void;
}) {
  const mode = MODES.find((m) => m.value === branch.mode)!;
  const modeId = useId();
  // The group whose `_overlap` set this branch can take
  const overlapGroup = branch.mode === "assign" ? branch.group : branch.mode === "shared" ? branch.set?.group : undefined;
  return (
    <div className="flex flex-col gap-3">
      <div className={labelClass}>
        <span className="flex items-center gap-1.5">
          <label htmlFor={modeId}>Who codes which units</label>
          <HelpButton topic="unit-distribution" label="Help: unit distribution" />
        </span>
        <select
          id={modeId}
          className={`${selectClass} w-fit`}
          value={branch.mode}
          onChange={(e) => onChange(switchMode(branch, e.target.value as UnitMode, groups))}
        >
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <span className="text-[11px] font-normal text-muted-foreground">{mode.help}</span>
      </div>

      {(branch.mode === "all" || branch.mode === "shared") && (
        <label className={labelClass}>
          Units
          <SetSelect
            groups={groups}
            value={branch.set}
            onChange={(set) => {
              const next = { ...branch, set };
              if (!set) {
                delete next.set;
                if (next.mode === "shared") delete next.overlap;
              }
              onChange(next);
            }}
          />
        </label>
      )}
      {branch.mode === "shared" && <SharedSettings branch={branch} agreeable={agreeable} onChange={onChange} />}
      {branch.mode === "assign" && <AssignSettings branch={branch} groups={groups} setParams={setParams} onChange={onChange} />}

      {overlapGroup !== undefined && branch.mode !== "all" && (
        <OverlapEditor
          overlap={branch.overlap}
          required={branch.mode === "assign"}
          group={groups.find((g) => g.name === overlapGroup)}
          canSpread={branch.mode !== "shared" || branch.maxUnits !== undefined}
          onChange={(overlap) => {
            const next = { ...branch, overlap } as UnitBranch;
            if (!overlap && next.mode === "shared") delete next.overlap;
            onChange(next);
          }}
        />
      )}

      <IssueList issues={issues.filter((issue) => !issue.path.includes("when"))} />
    </div>
  );
}

/** Every unit, or one set of a group (its `_overlap` units are not a set to choose). */
function SetSelect({ groups, value, onChange }: { groups: SetGroupResponse[]; value: SetRef | undefined; onChange: (set: SetRef | undefined) => void }) {
  const known = !value || groups.some((g) => g.name === value.group && g.sets.some((s) => s.name === value.set));
  return (
    <select
      className={`${selectClass} w-fit font-normal ${known ? "" : "border-destructive"}`}
      value={value ? `${value.group}/${value.set}` : ""}
      onChange={(e) => {
        const at = e.target.value.indexOf("/");
        onChange(at < 0 ? undefined : { group: e.target.value.slice(0, at), set: e.target.value.slice(at + 1) });
      }}
    >
      <option value="">All units</option>
      {!known && value && <option value={`${value.group}/${value.set}`}>{`${value.set} (${value.group}: not found)`}</option>}
      {groups.map((g) => (
        <optgroup key={g.name} label={`Group ${g.name}`}>
          {g.sets
            .filter((s) => s.name !== OVERLAP_SET)
            .map((s) => (
              <option key={s.name} value={`${g.name}/${s.name}`}>
                {s.name} ({s.unitIds.length} units)
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Where an assigned set comes from, as a select value. */
const fromValue = (from: AssignBranch["from"]) => ("draw" in from ? `draw:${from.draw}` : `session:${from.session}`);

/** An `assign` branch: the group, and how a coder's set is chosen. */
function AssignSettings({
  branch,
  groups,
  setParams,
  onChange,
}: {
  branch: AssignBranch;
  groups: SetGroupResponse[];
  setParams: Map<string, string>;
  onChange: (branch: UnitBranch) => void;
}) {
  const group = groups.find((g) => g.name === branch.group);
  const sets = group?.sets.filter((s) => s.name !== OVERLAP_SET) ?? [];
  const params = [...setParams].filter(([, g]) => g === branch.group).map(([name]) => name);
  const from = fromValue(branch.from);
  return (
    <div className="flex flex-col gap-3">
      <label className={labelClass}>
        Group
        {groups.length === 0 ? (
          <span className="text-[11px] font-normal text-muted-foreground">
            This job has no set groups yet: make one on the Units page (a sets column when uploading, or Split into sets).
          </span>
        ) : (
          <select
            className={`${selectClass} w-fit font-normal ${group ? "" : "border-destructive"}`}
            value={branch.group}
            onChange={(e) => onChange({ ...branch, group: e.target.value })}
          >
            {!group && <option value={branch.group}>{branch.group || "Choose a group…"}</option>}
            {groups.map((g) => (
              <option key={g.name} value={g.name}>
                {g.name} ({g.sets.filter((s) => s.name !== OVERLAP_SET).length} sets)
              </option>
            ))}
          </select>
        )}
      </label>
      <label className={labelClass}>
        A coder&apos;s set is
        <select
          className={`${selectClass} w-fit font-normal`}
          value={from}
          onChange={(e) => {
            const [kind, value] = e.target.value.split(":") as [string, string];
            onChange({ ...branch, from: kind === "draw" ? { draw: value as "balanced" | "random" } : { session: value } });
          }}
        >
          <option value="draw:balanced">Drawn: the set with the fewest coders</option>
          <option value="draw:random">Drawn at random</option>
          {params.map((p) => (
            <option key={p} value={`session:${p}`}>
              Named by the link or URL: $session.{p}
            </option>
          ))}
          {"session" in branch.from && !["participant", "email", ...params].includes(branch.from.session) && (
            <option value={from}>$session.{branch.from.session} (not a parameter with this group&apos;s sets)</option>
          )}
          <option value="session:participant">The coder&apos;s participant id</option>
          <option value="session:email">The coder&apos;s login email</option>
        </select>
      </label>
      <p className="text-[11px] text-muted-foreground">
        {"draw" in branch.from
          ? branch.from.draw === "balanced"
            ? "Drawn here: each new coder gets the set with the fewest coders (coders who stop count for 24 hours)."
            : "Drawn here: each new coder gets a set at random."
          : branch.from.session === "email"
            ? `Only the ${sets.length} email addresses that are set names of this group can code: coders log in, and other emails get "This email address has no access to this study".`
            : branch.from.session === "participant"
              ? "The participant id (from the link's URL parameter, see the Session item) names the set. Coders whose id is no set get no units here."
              : `Each set gets its own link (Invitations page), made from the link parameter ${branch.from.session}.`}
        {"draw" in branch.from && params.length === 0 && " To give each set its own link instead, add a link parameter with this group's sets to the Session item."}
      </p>
    </div>
  );
}

const numberOrUndefined = (v: string) => (v === "" ? undefined : Number(v));

/**
 * A shared queue's numbers as a small grid: units per coder (min, max), and
 * coders per unit or agreement per unit (the `until` rule, and max coders).
 */
export function SharedSettings({
  branch,
  agreeable,
  onChange,
  allowAgreement = true,
}: {
  branch: SharedBranch;
  agreeable: string[];
  onChange: (b: UnitBranch) => void;
  /** Offer "agreement per unit" (not in the setup wizard: it needs a question with options). */
  allowAgreement?: boolean;
}) {
  const agree = "agree" in branch.until;
  const needed = agree && "agree" in branch.until ? branch.until.agree : "coders" in branch.until ? branch.until.coders : 1;
  const numberInput = "h-8 w-full text-xs";
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
          value={branch.minUnits ?? ""}
          placeholder="none"
          onChange={(e) => onChange({ ...branch, minUnits: numberOrUndefined(e.target.value) })}
        />
        <Input
          type="number"
          min={1}
          className={numberInput}
          aria-label="Max units per coder"
          value={branch.maxUnits ?? ""}
          placeholder="no limit"
          onChange={(e) => onChange({ ...branch, maxUnits: numberOrUndefined(e.target.value) })}
        />
        <span />

        {!allowAgreement ? (
          <span className="font-semibold">Coders per unit</span>
        ) : (
        <select
          className={selectClass}
          aria-label="Each unit is coded until"
          value={agree ? "agree" : "coders"}
          onChange={(e) => {
            const n = Math.max(2, needed);
            onChange({
              ...branch,
              until: e.target.value === "agree" ? { agree: n, on: agreeable[0] ?? "" } : { coders: needed },
              // Agreement needs room for disagreement: at most is above the agreeing coders
              ...(e.target.value === "agree" && (branch.maxCoders === undefined || branch.maxCoders < n) ? { maxCoders: Math.max(3, n + 1) } : {}),
            });
          }}
        >
          <option value="coders">Coders per unit</option>
          <option value="agree">Agreement per unit</option>
        </select>
        )}
        <Input
          type="number"
          min={agree ? 2 : 1}
          className={numberInput}
          aria-label={agree ? "Coders who must agree" : "Coders per unit"}
          value={needed}
          onChange={(e) => {
            const n = Number(e.target.value) || 1;
            // Max coders can't be below the number needed: it follows upwards.
            const maxCoders = branch.maxCoders !== undefined && branch.maxCoders < n ? n : branch.maxCoders;
            onChange({ ...branch, maxCoders, until: agree && "on" in branch.until ? { agree: n, on: branch.until.on } : { coders: n } });
          }}
        />
        <Input
          type="number"
          min={1}
          className={numberInput}
          aria-label="Max coders per unit"
          value={branch.maxCoders ?? ""}
          placeholder={agree ? "required" : "= at least"}
          onChange={(e) => onChange({ ...branch, maxCoders: numberOrUndefined(e.target.value) })}
        />
        {agree && "on" in branch.until ? (
          <span className="flex items-center gap-1.5">
            agree on
            <select
              className={selectClass}
              aria-label="Question coders agree on"
              value={branch.until.on}
              onChange={(e) => onChange({ ...branch, until: { ...branch.until, on: e.target.value } as SharedBranch["until"] })}
            >
              {!agreeable.includes(branch.until.on) && <option value={branch.until.on}>{branch.until.on || "(choose a question)"}</option>}
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
        {agree
          ? "A unit is done once the least number of coders agree on the question, or the most coders coded it."
          : "A unit is done once the least number of coders coded it. When no unit needs more, coders get units up to the most."}
      </p>
      <label className={labelClass}>
        Priority
        <select
          className={`${selectClass} w-fit`}
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
            <option value="first">First, before the coder&apos;s own units</option>
            <option value="last">Last, after them</option>
            <option value="spread" disabled={!canSpread}>
              Spread through them{canSpread ? "" : " (needs max units per coder)"}
            </option>
            {required && <option value="disabled">Disabled: no overlap</option>}
          </select>
        </label>
        {on && (
          <>
            <label className={labelClass}>
              Recommended
              <Input
                type="number"
                min={1}
                className="h-8 w-24 text-xs font-normal"
                placeholder="any"
                title="Warns at publishing if the group has fewer overlap units"
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
