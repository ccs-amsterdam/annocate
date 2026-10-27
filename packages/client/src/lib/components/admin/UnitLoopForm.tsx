import { Plus, Trash2 } from "lucide-react";
import {
  ALL_UNITS_UNITSET,
  type AnyVariableType,
  type CodebookItem,
  type CodebookValidationIssue,
  type DynamicSource,
  type UnitBranch,
  type UnitLoopItem,
  type UnitSource,
  type UnitsetResponse,
} from "@annotinder/contracts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConditionEditor } from "./ConditionEditor";
import { IssueList } from "./IssueList";
import { issuesAt } from "./issues";

const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-xs";

function questionNames(items: CodebookItem[]): string[] {
  return items.flatMap((i) => (i.type === "condition" ? questionNames(i.children as CodebookItem[]) : [i.name]));
}

/**
 * Edits how a unit_loop distributes units (contracts unitLoop.ts): its
 * unitsets (fixed or dynamic sources), or with branches, per branch a
 * condition on coder-level questions and its unitsets.
 */
export function UnitLoopForm({
  loop,
  unitsets,
  coderQuestions,
  validationIssues,
  onChange,
}: {
  loop: UnitLoopItem;
  unitsets: UnitsetResponse[];
  /** Coder-level questions before the loop: what branch conditions and unitset names may use. */
  coderQuestions: { name: string; variable: AnyVariableType }[];
  validationIssues: CodebookValidationIssue[];
  onChange: (loop: UnitLoopItem) => void;
}) {
  const branches = loop.units ?? [{ sources: [{ unitset: ALL_UNITS_UNITSET }] }];
  const loopQuestions = questionNames(loop.children as CodebookItem[]);
  const setBranches = (units: UnitBranch[]) => onChange({ ...loop, units });
  const setBranch = (b: number, branch: UnitBranch) => setBranches(branches.map((x, i) => (i === b ? branch : x)));
  const issues = issuesAt(validationIssues, "units");

  // One branch without a condition: just the unitsets. Several: every
  // branch but the last has a condition ("if", "else if"); the last is
  // "otherwise" (an older codebook may lack it: then coders matching no
  // branch get no units).
  const multi = branches.length > 1 || branches[0].when !== undefined;
  const hasOtherwise = branches[branches.length - 1].when === undefined;
  const branchLabel = (b: number) => (branches[b].when === undefined ? "Otherwise" : b === 0 ? "If" : "Else if");

  const toggleBranches = (on: boolean) => {
    if (on) {
      setBranches([{ when: { script: "true" }, sources: [{ unitset: ALL_UNITS_UNITSET }] }, ...branches]);
      return;
    }
    const last = branches[branches.length - 1];
    if (branches.length > 1 && !confirm("Keep only the last branch's units, and drop the other branches?")) return;
    setBranches([{ sources: last.sources }]);
  };
  const addBranch = () => {
    const added: UnitBranch = { when: { script: "true" }, sources: [{ unitset: ALL_UNITS_UNITSET }] };
    setBranches(hasOtherwise ? [...branches.slice(0, -1), added, branches[branches.length - 1]] : [...branches, added]);
  };
  const removeBranch = (b: number) => {
    const rest = branches.filter((_, i) => i !== b);
    // Back to one branch: it has no condition.
    setBranches(rest.length === 1 ? [{ sources: rest[0].sources }] : rest);
  };

  return (
    <div className="flex flex-col gap-3">
      <datalist id="unitset-names">
        <option value={ALL_UNITS_UNITSET}>All units</option>
        {unitsets.map((u) => (
          <option key={u.id} value={u.name} />
        ))}
      </datalist>

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Order
          <select
            className={selectClass}
            value={loop.order ?? "sequential"}
            onChange={(e) => onChange({ ...loop, order: e.target.value as UnitLoopItem["order"] })}
          >
            <option value="sequential">Sequential</option>
            <option value="random">Random (per coder, sources mixed)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Max units per coder
          <Input
            type="number"
            min={1}
            className="h-8 w-28 text-xs"
            value={loop.maxUnits ?? ""}
            placeholder="no limit"
            onChange={(e) => onChange({ ...loop, maxUnits: e.target.value === "" ? undefined : Number(e.target.value) })}
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-xs font-semibold">
        <input type="checkbox" checked={multi} onChange={(e) => toggleBranches(e.target.checked)} />
        Different units per coder (branches)
      </label>

      {multi ? (
        <>
          {branches.map((branch, b) => (
            <div key={b} className="flex flex-col gap-2 rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">{branchLabel(b)}</span>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeBranch(b)} aria-label="Remove branch">
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
              <SourcesEditor sources={branch.sources} loopQuestions={loopQuestions} onChange={(sources) => setBranch(b, { ...branch, sources })} />
            </div>
          ))}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={addBranch}>
              <Plus className="h-3.5 w-3.5" /> Branch
            </Button>
            {!hasOtherwise && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setBranches([...branches, { sources: [{ unitset: ALL_UNITS_UNITSET }] }])}
              >
                <Plus className="h-3.5 w-3.5" /> Otherwise
              </Button>
            )}
          </div>
        </>
      ) : (
        <SourcesEditor
          sources={branches[0].sources}
          loopQuestions={loopQuestions}
          onChange={(sources) => setBranches([{ sources }])}
        />
      )}

      <IssueList issues={issues.filter((issue) => !issue.path.includes("when"))} />
    </div>
  );
}

/** A branch's unit sources: a unitset each, fixed or dynamic. */
function SourcesEditor({
  sources,
  loopQuestions,
  onChange,
}: {
  sources: UnitSource[];
  loopQuestions: string[];
  onChange: (sources: UnitSource[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {sources.map((source, s) => (
        <SourceEditor
          key={s}
          source={source}
          loopQuestions={loopQuestions}
          onChange={(next) => onChange(sources.map((x, i) => (i === s ? next : x)))}
          onRemove={sources.length > 1 ? () => onChange(sources.filter((_, i) => i !== s)) : undefined}
        />
      ))}
      <Button type="button" variant="ghost" size="sm" className="self-start text-xs" onClick={() => onChange([...sources, { unitset: "" }])}>
        <Plus className="h-3.5 w-3.5" /> Unitset
      </Button>
    </div>
  );
}

function SourceEditor({
  source,
  loopQuestions,
  onChange,
  onRemove,
}: {
  source: UnitSource;
  loopQuestions: string[];
  onChange: (source: UnitSource) => void;
  onRemove?: () => void;
}) {
  const dynamic = source.dynamic;
  const setDynamic = (patch: Partial<DynamicSource>) => onChange({ ...source, dynamic: { ...dynamic, ...patch } });
  const numberOrUndefined = (v: string) => (v === "" ? undefined : Number(v));

  return (
    <div className="flex flex-col gap-2 rounded border border-border/60 bg-muted/20 p-2">
      <div className="flex items-center gap-2">
        <Input
          list="unitset-names"
          className="h-8 text-xs"
          placeholder="unitset"
          value={source.unitset}
          onChange={(e) => onChange({ ...source, unitset: e.target.value })}
        />
        <select
          className={selectClass}
          value={dynamic ? "dynamic" : "fixed"}
          onChange={(e) => onChange({ ...source, dynamic: e.target.value === "dynamic" ? { maxCoders: 1 } : undefined })}
        >
          <option value="fixed">Fixed: coder gets all units</option>
          <option value="dynamic">Dynamic: shared queue</option>
        </select>
        {onRemove && (
          <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {dynamic && (
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <label className="flex flex-col gap-1">
            Min coders
            <Input
              type="number"
              min={1}
              className="h-8 w-20 text-xs"
              value={dynamic.minCoders ?? ""}
              placeholder="1"
              onChange={(e) => setDynamic({ minCoders: numberOrUndefined(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1">
            Max coders
            <Input
              type="number"
              min={1}
              className="h-8 w-20 text-xs"
              value={dynamic.maxCoders ?? ""}
              placeholder="none"
              onChange={(e) => setDynamic({ maxCoders: numberOrUndefined(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1">
            Priority
            <select
              className={selectClass}
              value={dynamic.priority ?? "cover"}
              onChange={(e) => setDynamic({ priority: e.target.value as DynamicSource["priority"] })}
            >
              <option value="cover">Cover all units first</option>
              <option value="saturate">Saturate units first</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Agreement on
            <select
              className={selectClass}
              value={dynamic.agreement?.variable ?? ""}
              onChange={(e) =>
                setDynamic({
                  agreement: e.target.value
                    ? { variable: e.target.value, minAgree: dynamic.agreement?.minAgree ?? 2 }
                    : undefined,
                })
              }
            >
              <option value="">(no agreement rule)</option>
              {loopQuestions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {dynamic.agreement && (
            <label className="flex flex-col gap-1">
              Min agree
              <Input
                type="number"
                min={2}
                className="h-8 w-20 text-xs"
                value={dynamic.agreement.minAgree}
                onChange={(e) => setDynamic({ agreement: { ...dynamic.agreement!, minAgree: Number(e.target.value) } })}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
