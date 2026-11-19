import { Plus, Trash2 } from "lucide-react";
import type { ConditionSpec, DesignIssue, SessionItem, SetGroupResponse } from "@annotinder/contracts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { HelpButton } from "../../help/HelpButton";
import { assignmentLinks, coderSummary, columnValues, conditionProblems } from "../../design/assignment";
import { IssueList } from "./IssueList";
import { issuesAt } from "./issues";

const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-xs";
const labelClass = "flex flex-col gap-1 text-xs font-semibold";

/**
 * Who gets which units (docs/plans/unit-assignment.md): the units divided
 * over coders, and assigned conditions, each optionally linked to a set
 * column of the units. Checked against the draft units as you edit; deploying
 * checks the same.
 */
export function AssignmentSettings({
  item,
  groups,
  issues,
  onChange,
}: {
  item: SessionItem;
  groups: SetGroupResponse[];
  issues: DesignIssue[];
  onChange: (item: SessionItem) => void;
}) {
  const columns = groups.map((g) => g.name);
  const coders = item.coders ? coderSummary(columnValues(groups, item.coders.column)) : null;
  const conditions = item.conditions ?? [];
  const links = assignmentLinks(coders, conditions, groups);
  const setConditions = (next: ConditionSpec[]) => {
    // Undefined, not deleted: the editor merges an item's update into it
    onChange({ ...item, conditions: next.length > 0 ? next : undefined });
  };
  const addCondition = () => {
    let n = conditions.length + 1;
    while (conditions.some((c) => c.name === `condition_${n}`)) n++;
    setConditions([...conditions, { name: `condition_${n}`, values: ["control", "experiment"], assign: "random", draw: "balanced" }]);
  };

  return (
    <>
      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold">
          Coders
          <InfoTip label="About coders">
            Divide the units over coders with a set column in the units: each unit says who codes it (<span className="font-mono">anna</span>,{" "}
            <span className="font-mono">anna;bob</span> for both, <span className="font-mono">_overlap</span> for everyone). Names give a link
            per coder; email addresses give one link where coders sign in and get their own units.
          </InfoTip>
          <HelpButton topic="sets" label="Help: dividing units" />
        </h3>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={item.coders !== undefined}
            onChange={(e) => {
              onChange({ ...item, coders: e.target.checked ? { column: columns.includes("coder") ? "coder" : (columns[0] ?? "coder") } : undefined });
            }}
          />
          Units are divided over coders
        </label>
        {item.coders && (
          <div className="flex flex-col gap-1.5 rounded-md border border-border p-2">
            <label className={labelClass}>
              Column with the coders
              <ColumnSelect label="Column with the coders" columns={columns} value={item.coders.column} onChange={(column) => onChange({ ...item, coders: { column: column ?? "coder" } })} />
            </label>
            {coders && <CoderNote kind={coders.kind} count={coders.count} notEmails={coders.notEmails} column={item.coders.column} known={columns.includes(item.coders.column)} />}
            <IssueList issues={issuesAt(issues, "coders")} />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold">
          Assigned conditions
          <InfoTip label="About assigned conditions">
            A condition a session starts with: from its link (a link per value), or drawn when it starts (one link, random or balanced). Use it
            as <span className="font-mono">$session.name</span> in Show if blocks and texts. Linked to a set column, its value also selects the
            session&apos;s units. For a condition drawn later in the flow, add a computed variable (Random condition) instead.
          </InfoTip>
        </h3>
        {conditions.map((condition, i) => (
          <ConditionEditor
            key={i}
            condition={condition}
            columns={columns}
            groups={groups}
            issues={issuesAt(issues, "conditions", i)}
            onChange={(next) => setConditions(conditions.map((c, j) => (j === i ? next : c)))}
            onRemove={() => setConditions(conditions.filter((_, j) => j !== i))}
          />
        ))}
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={addCondition}>
          <Plus className="h-3.5 w-3.5" /> Condition
        </Button>
        {(item.coders || conditions.some((c) => c.assign === "link")) && (
          <p className="text-[11px] text-muted-foreground">
            Deploying makes {links} link{links === 1 ? "" : "s"} for these
            {item.params.some((p) => p.kind === "link") ? ", times the link parameters below" : ""}.
          </p>
        )}
      </section>
    </>
  );
}

function CoderNote({ kind, count, notEmails, column, known }: { kind: string; count: number; notEmails: string[]; column: string; known: boolean }) {
  if (!known) return <p className="text-[11px] text-amber-700 dark:text-amber-400">The units have no set column &quot;{column}&quot; yet: add it on the Units page.</p>;
  if (kind === "none") return <p className="text-[11px] text-amber-700 dark:text-amber-400">Column &quot;{column}&quot; has no coders yet.</p>;
  if (kind === "mixed")
    return (
      <p className="text-[11px] text-destructive">
        Mixes names and email addresses ({notEmails.slice(0, 3).join(", ")}
        {notEmails.length > 3 ? ", …" : ""}): use only one kind.
      </p>
    );
  return (
    <p className="text-[11px] text-muted-foreground">
      {count} coder{count === 1 ? "" : "s"}:{" "}
      {kind === "emails" ? "email addresses, so one link where coders sign in." : "names, so a link per coder."}
    </p>
  );
}

function ColumnSelect({
  columns,
  value,
  onChange,
  optional,
  label,
}: {
  columns: string[];
  value: string | undefined;
  onChange: (column: string | undefined) => void;
  optional?: boolean;
  label: string;
}) {
  const options = value && !columns.includes(value) ? [...columns, value] : columns;
  return (
    <select aria-label={label} className={selectClass} value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
      {(optional || options.length === 0) && <option value="">{optional ? "Not linked to units" : "No set columns yet"}</option>}
      {options.map((c) => (
        <option key={c} value={c}>
          {c}
          {columns.includes(c) ? "" : " (not in the units)"}
        </option>
      ))}
    </select>
  );
}

function ConditionEditor({
  condition,
  columns,
  groups,
  issues,
  onChange,
  onRemove,
}: {
  condition: ConditionSpec;
  columns: string[];
  groups: SetGroupResponse[];
  issues: DesignIssue[];
  onChange: (next: ConditionSpec) => void;
  onRemove: () => void;
}) {
  const problems = conditionProblems(condition, groups);
  const how = condition.assign === "link" ? "link" : (condition.draw ?? "random");
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border p-2">
      <div className="flex items-center gap-2">
        <Input
          aria-label="Condition name"
          className="h-8 max-w-48 font-mono text-xs"
          value={condition.name}
          onChange={(e) => onChange({ ...condition, name: e.target.value })}
        />
        <span className="font-mono text-[11px] text-muted-foreground">$session.{condition.name}</span>
        <Button type="button" variant="ghost" size="icon-sm" className="ml-auto" aria-label={`Remove ${condition.name}`} onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <label className={labelClass}>
        Assigned
        <select
          aria-label="How the condition is assigned"
          className={selectClass}
          value={how}
          onChange={(e) => {
            const next: ConditionSpec = { ...condition };
            if (e.target.value === "link") {
              next.assign = "link";
              delete next.draw;
            } else {
              next.assign = "random";
              next.draw = e.target.value as "random" | "balanced";
            }
            onChange(next);
          }}
        >
          <option value="link">By link: a link per value</option>
          <option value="balanced">At the start: one link, balanced</option>
          <option value="random">At the start: one link, random</option>
        </select>
      </label>
      <label className={labelClass}>
        Linked to units
        <ColumnSelect
          label="Linked to units"
          optional
          columns={columns}
          value={condition.units}
          onChange={(units) => {
            const next: ConditionSpec = { ...condition, units };
            if (!units) {
              delete next.units;
              if (next.values === "free") next.values = ["control", "experiment"];
            }
            onChange(next);
          }}
        />
      </label>
      <div className={labelClass}>
        <span className="flex items-center gap-2">
          Values
          {condition.units && (
            <label className="flex items-center gap-1 font-normal">
              <input
                type="checkbox"
                checked={condition.values === "free"}
                onChange={(e) => {
                  const found = columnValues(groups, condition.units!).slice(0, 1000);
                  onChange({ ...condition, values: e.target.checked ? "free" : found.length > 0 ? found : ["a"] });
                }}
              />
              All values in the column
            </label>
          )}
        </span>
        {condition.values === "free" ? (
          <p className="text-[11px] font-normal text-muted-foreground">
            {columnValues(groups, condition.units ?? "").length} values from column &quot;{condition.units}&quot;, whatever they are.
          </p>
        ) : (
          <ValueChips values={condition.values} onChange={(values) => onChange({ ...condition, values })} />
        )}
      </div>
      {problems.errors.map((p) => (
        <p key={p} className="text-[11px] text-destructive">
          {p}
        </p>
      ))}
      {problems.warnings.map((p) => (
        <p key={p} className="text-[11px] text-amber-700 dark:text-amber-400">
          {p}
        </p>
      ))}
      <IssueList issues={issues} />
    </div>
  );
}

function ValueChips({ values, onChange }: { values: string[]; onChange: (values: string[]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {values.map((v, i) => (
        <span key={i} className="inline-flex items-center gap-0.5 rounded border border-border bg-muted/40 py-0.5 pl-1.5 pr-0.5 font-mono text-[11px] font-normal">
          {v}
          <button type="button" aria-label={`Remove ${v}`} className="rounded px-1 text-muted-foreground hover:text-foreground" onClick={() => onChange(values.filter((_, j) => j !== i))}>
            ×
          </button>
        </span>
      ))}
      <Input
        aria-label="Add a value"
        placeholder="Add value…"
        className="h-7 w-28 font-mono text-[11px] font-normal"
        onKeyDown={(e) => {
          const input = e.currentTarget;
          const value = input.value.trim();
          if ((e.key === "Enter" || e.key === ",") && value) {
            e.preventDefault();
            if (!values.includes(value)) onChange([...values, value]);
            input.value = "";
          }
        }}
      />
    </div>
  );
}
