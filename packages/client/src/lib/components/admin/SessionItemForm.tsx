import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  CONFIRM_LINKS,
  MAX_LINKS,
  OVERLAP_SET,
  linkCombinations,
  linkKey,
  type CodebookValidationIssue,
  type SessionItem,
  type SessionParam,
  type SessionValues,
  type SetGroupResponse,
} from "@annotinder/contracts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { HelpButton } from "../../help/HelpButton";
import { IssueList } from "./IssueList";
import { issuesAt } from "./issues";

const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-xs";
const labelClass = "flex flex-col gap-1 text-xs font-semibold";

/** What a parameter's values are, as a select value. */
const valuesKind = (values: SessionValues) => ("list" in values ? "list" : "sets" in values ? "sets" : "open");

/**
 * The codebook's Session item (docs/plans/sets-and-session-parameters.md
 * §3): link parameters (a link per combination of their values), URL
 * parameters (added to a link by whoever shares it, e.g. a panel), and the
 * participant id's URL parameter. All are `$session.<name>` values.
 */
export function SessionItemForm({
  item,
  groups,
  issues,
  onChange,
}: {
  item: SessionItem;
  groups: SetGroupResponse[];
  issues: CodebookValidationIssue[];
  onChange: (item: SessionItem) => void;
}) {
  const setsOf = (group: string) => groups.find((g) => g.name === group)?.sets.filter((s) => s.name !== OVERLAP_SET).map((s) => s.name) ?? [];
  const params = item.params;
  const setParam = (i: number, param: SessionParam) => onChange({ ...item, params: params.map((p, j) => (j === i ? param : p)) });
  const linkParams = params.filter((p) => p.kind === "link");
  // Every combination (ignoring the listed ones), and those that make links
  const all = linkCombinations({ ...item, combinations: undefined }, setsOf);
  const links = linkCombinations(item, setsOf);
  const chosen = new Set((item.combinations ?? []).map(linkKey));

  const addParam = () => {
    let n = params.length + 1;
    while (params.some((p) => p.name === `param_${n}`)) n++;
    onChange({ ...item, params: [...params, { name: `param_${n}`, kind: "link", values: { list: [{ value: "a" }, { value: "b" }] } }] });
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold">
          Session parameters
          <HelpButton topic="session-parameters" label="Help: session parameters" />
        </h3>
        <p className="text-[11px] text-muted-foreground">
          Values a session starts with, used as <span className="font-mono">$session.name</span> in conditions, texts and to assign sets.
          A <strong>link parameter</strong> is fixed in the link: every value (or combination of values) gets its own link on the Invitations
          page. A <strong>URL parameter</strong> is added to a link by whoever shares it (e.g. <span className="font-mono">?wave=2</span>).
          Built in: <span className="font-mono">$session.participant</span>, <span className="font-mono">$session.source</span> (the
          optional <span className="font-mono">?source=</span> of any link) and <span className="font-mono">$session.email</span>.
        </p>
        {params.map((param, i) => (
          <ParamEditor
            key={i}
            param={param}
            groups={groups}
            issues={issuesAt(issues, "params", i)}
            onChange={(next) => setParam(i, next)}
            onRemove={() => onChange({ ...item, params: params.filter((_, j) => j !== i) })}
          />
        ))}
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={addParam}>
          <Plus className="h-3.5 w-3.5" /> Parameter
        </Button>
      </section>

      {linkParams.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold">Links</h3>
          <p className={`text-[11px] ${links.length > CONFIRM_LINKS ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
            Publishing makes {links.length} link{links.length === 1 ? "" : "s"}
            {item.combinations ? ` (of ${all.length} combinations)` : ""}.
            {links.length > MAX_LINKS
              ? ` At most ${MAX_LINKS} are possible: choose the combinations you need.`
              : links.length > CONFIRM_LINKS
                ? " That is a lot: publishing asks to confirm."
                : ""}
          </p>
          {linkParams.length > 1 && (
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={item.combinations !== undefined}
                onChange={(e) => {
                  const next = { ...item };
                  if (e.target.checked) next.combinations = all.slice(0, MAX_LINKS);
                  else delete next.combinations;
                  onChange(next);
                }}
              />
              Only some combinations
            </label>
          )}
          {item.combinations !== undefined && (
            <div className="flex max-h-60 flex-col gap-0.5 overflow-y-auto rounded-md border border-border p-2 text-xs">
              {all.slice(0, 500).map((combo) => {
                const key = linkKey(combo);
                return (
                  <label key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={chosen.has(key)}
                      onChange={(e) =>
                        onChange({
                          ...item,
                          combinations: e.target.checked
                            ? [...(item.combinations ?? []), combo]
                            : (item.combinations ?? []).filter((c) => linkKey(c) !== key),
                        })
                      }
                    />
                    <span className="font-mono">{Object.entries(combo).map(([k, v]) => `${k}=${v}`).join(", ")}</span>
                  </label>
                );
              })}
              {all.length > 500 && <span className="text-muted-foreground">… and {all.length - 500} more (edit them in the JSON view)</span>}
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-xs font-semibold">
          <input
            type="checkbox"
            checked={item.participant !== undefined}
            onChange={(e) => {
              const next = { ...item };
              if (e.target.checked) next.participant = { param: "PROLIFIC_PID" };
              else delete next.participant;
              onChange(next);
            }}
          />
          Participant id from a URL parameter
          <HelpButton topic="online-panels" label="Help: online panels" />
        </label>
        {item.participant && (
          <div className="flex flex-wrap gap-3 pl-6">
            <label className={labelClass}>
              URL parameter
              <Input
                className="h-8 w-48 font-mono text-xs font-normal"
                value={item.participant.param}
                onChange={(e) => onChange({ ...item, participant: { ...item.participant!, param: e.target.value } })}
              />
            </label>
            <label className={labelClass}>
              Pattern (optional)
              <Input
                className="h-8 w-48 font-mono text-xs font-normal"
                placeholder="e.g. [0-9a-f]{24}"
                value={item.participant.pattern ?? ""}
                onChange={(e) => onChange({ ...item, participant: { ...item.participant!, pattern: e.target.value || undefined } })}
              />
            </label>
            <p className="w-full text-[11px] text-muted-foreground">
              Required to start: a link without it, or with a value not matching the pattern, is refused. A participant id is a label, not a
              password: the same id on another device starts a new session (after asking).
            </p>
          </div>
        )}
      </section>

      <IssueList issues={issues.filter((i) => !i.path.includes("params"))} />
    </div>
  );
}

function ParamEditor({
  param,
  groups,
  issues,
  onChange,
  onRemove,
}: {
  param: SessionParam;
  groups: SetGroupResponse[];
  issues: CodebookValidationIssue[];
  onChange: (param: SessionParam) => void;
  onRemove: () => void;
}) {
  const kind = valuesKind(param.values);
  const setKind = (next: "link" | "url") => {
    const p: SessionParam = { ...param, kind: next };
    if (next === "link") {
      delete p.param;
      delete p.default;
      if ("open" in p.values) p.values = { list: [{ value: "a" }] };
    }
    onChange(p);
  };
  const setValues = (values: SessionValues) => onChange({ ...param, values });
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className={labelClass}>
          Name
          <Input className="h-8 w-40 font-mono text-xs font-normal" value={param.name} onChange={(e) => onChange({ ...param, name: e.target.value })} />
        </label>
        <label className={labelClass}>
          Kind
          <select className={`${selectClass} font-normal`} value={param.kind} onChange={(e) => setKind(e.target.value as "link" | "url")}>
            <option value="link">Link parameter (a link per value)</option>
            <option value="url">URL parameter (?{param.param ?? param.name}=…)</option>
          </select>
        </label>
        <label className={labelClass}>
          Values
          <select
            className={`${selectClass} font-normal`}
            value={kind}
            onChange={(e) =>
              setValues(
                e.target.value === "list" ? { list: [{ value: "a" }] } : e.target.value === "sets" ? { sets: groups[0]?.name ?? "" } : { open: {} },
              )
            }
          >
            <option value="list">From a list</option>
            <option value="sets">The sets of a group</option>
            {param.kind === "url" && <option value="open">Any value</option>}
          </select>
        </label>
        <Button type="button" variant="ghost" size="icon-sm" className="ml-auto" aria-label={`Remove ${param.name}`} onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {"list" in param.values && <ListValues values={param.values.list.map((v) => v.value)} onChange={(list) => setValues({ list: list.map((value) => ({ value })) })} />}
      {"sets" in param.values && (
        <label className={labelClass}>
          Group
          <select className={`${selectClass} w-fit font-normal`} value={param.values.sets} onChange={(e) => setValues({ sets: e.target.value })}>
            {!groups.some((g) => "sets" in param.values && g.name === param.values.sets) && (
              <option value={param.values.sets}>{param.values.sets || "Choose a group…"}</option>
            )}
            {groups.map((g) => (
              <option key={g.name} value={g.name}>
                {g.name} ({g.sets.filter((s) => s.name !== OVERLAP_SET).length} sets)
              </option>
            ))}
          </select>
          <span className="text-[11px] font-normal text-muted-foreground">
            A loop can assign the set this names (Assign sets: named by the link or URL). New sets get links without publishing again.
          </span>
        </label>
      )}
      {"open" in param.values && (
        <label className={labelClass}>
          Pattern (optional)
          <Input
            className="h-8 w-56 font-mono text-xs font-normal"
            placeholder="e.g. [0-9]+"
            value={param.values.open.pattern ?? ""}
            onChange={(e) => setValues({ open: { pattern: e.target.value || undefined } })}
          />
        </label>
      )}

      {param.kind === "url" && (
        <div className="flex flex-wrap items-end gap-3">
          <label className={labelClass}>
            URL key
            <Input
              className="h-8 w-40 font-mono text-xs font-normal"
              placeholder={param.name}
              value={param.param ?? ""}
              onChange={(e) => onChange({ ...param, param: e.target.value || undefined })}
            />
          </label>
          <label className={labelClass}>
            Default
            <Input
              className="h-8 w-40 text-xs font-normal"
              placeholder="none: required"
              value={param.default ?? ""}
              onChange={(e) => onChange({ ...param, default: e.target.value || undefined })}
            />
          </label>
          <span className="text-[11px] text-muted-foreground">
            {param.default === undefined ? "Required: a link without it doesn't start." : "Used when the link has none."}
          </span>
        </div>
      )}
      <label className={labelClass}>
        Description (optional)
        <Input
          className="h-8 text-xs font-normal"
          value={param.description ?? ""}
          onChange={(e) => onChange({ ...param, description: e.target.value || undefined })}
        />
      </label>
      <IssueList issues={issues} />
    </div>
  );
}

/** A list of values, one per line (the text as typed, so empty lines can be added). */
function ListValues({ values, onChange }: { values: string[]; onChange: (values: string[]) => void }) {
  const [text, setText] = useState(values.join("\n"));
  return (
    <label className={labelClass}>
      List (one value per line)
      <textarea
        className="min-h-16 rounded-md border border-input bg-background p-2 font-mono text-xs font-normal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(
            e.target.value
              .split("\n")
              .map((v) => v.trim())
              .filter(Boolean),
          );
        }}
      />
    </label>
  );
}
