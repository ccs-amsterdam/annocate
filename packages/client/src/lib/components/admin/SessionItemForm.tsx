import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  inviteOf,
  urlParamKey,
  type DesignIssue,
  type SessionItem,
  type SetGroupResponse,
  type UrlParam,
} from "@annotinder/contracts";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { HelpButton } from "../../help/HelpButton";
import { IssueList } from "./IssueList";
import { issuesAt } from "./issues";
import { InvitationSettings } from "./session/InvitationSettings";
import { NoUnitsNotice } from "./session/NoUnitsNotice";
import { useSessionTab } from "./session/sessionTab";
import { DisplaySettings } from "./session/DisplaySettings";
import { withOptional, withOptionals, withUrlParams } from "../../design/itemSettings";

const labelClass = "flex flex-col gap-1 text-xs font-semibold";

/**
 * One part of the design's Study entry (docs/architecture.md §6), the one
 * opened from the buttons above the tree: the who codes (who codes,
 * and how they get in), the URL parameters (values a link carries, e.g.
 * from a panel: `$session.<name>`) or the display. The public title is
 * edited above the tree, the normal end in its "At the end" row.
 */
export function SessionItemForm({
  item,
  groups,
  issues,
  client,
  onChange,
}: {
  item: SessionItem;
  groups: SetGroupResponse[];
  issues: DesignIssue[];
  /** To make a coders' column (absent: read only). */
  client?: ResearcherApi;
  onChange: (item: SessionItem) => void;
}) {
  const [tab] = useSessionTab();
  const setDisplay = (display: NonNullable<SessionItem["display"]>) =>
    onChange(withOptional(item, "display", Object.keys(display).length > 0 ? display : undefined));
  const inviteForm = (
    <InvitationSettings
      invite={inviteOf(item)}
      groups={groups}
      issues={issues}
      client={client}
      onChange={(invite) => onChange(withOptional(item, "invite", invite))}
    />
  );
  return (
    <div className="flex flex-col gap-4">
      {tab === "display" ? (
        <DisplaySettings display={item.display} onChange={(display) => setDisplay(display)} />
      ) : tab === "invite" ? (
        // Who codes not chosen yet: the choice is never folded away
        client && inviteOf(item) ? (
          <NoUnitsNotice client={client}>{inviteForm}</NoUnitsNotice>
        ) : (
          inviteForm
        )
      ) : (
        <UrlParamsSettings
          params={item.urlParams ?? []}
          issues={issuesAt(issues, "urlParams")}
          onChange={(params) => onChange(withUrlParams(item, params))}
        />
      )}
      <IssueList issues={issues.filter((i) => !i.path.includes("invite") && !i.path.includes("urlParams"))} />
    </div>
  );
}

/** The URL parameters a link takes. */
function UrlParamsSettings({
  params,
  issues,
  onChange,
}: {
  params: UrlParam[];
  issues: DesignIssue[];
  onChange: (params: UrlParam[]) => void;
}) {
  const add = () => {
    let n = params.length + 1;
    while (params.some((p) => p.name === `param_${n}`)) n++;
    onChange([...params, { name: `param_${n}` }]);
  };
  return (
    <section className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Values a link carries, added by whoever shares it (e.g. <span className="font-mono">?wave=2</span>, or a
        panel&apos;s study id). Use them as <span className="font-mono">$session.name</span> in conditions and texts.
        <InfoTip label="About URL parameters">
          A parameter without a default is required: a link without it doesn&apos;t start. Built in:{" "}
          <span className="font-mono">$session.source</span> (the optional <span className="font-mono">?source=</span>{" "}
          of any link), and <span className="font-mono">$session.coder</span> (who the coder is: their name, or a
          crowd&apos;s id).
        </InfoTip>
        <HelpButton topic="session-parameters" label="Help: URL parameters" />
      </p>
      {params.map((param, i) => (
        <ParamEditor
          key={i}
          param={param}
          issues={issuesAt(issues, i)}
          onChange={(next) => onChange(params.map((p, j) => (j === i ? next : p)))}
          onRemove={() => onChange(params.filter((_, j) => j !== i))}
        />
      ))}
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={add}>
        <Plus className="h-3.5 w-3.5" /> URL parameter
      </Button>
    </section>
  );
}

type ValuesKind = "any" | "list" | "pattern";

/** One URL parameter: its name, URL key, values (any, a list or a pattern) and default. */
function ParamEditor({
  param,
  issues,
  onChange,
  onRemove,
}: {
  param: UrlParam;
  issues: DesignIssue[];
  onChange: (param: UrlParam) => void;
  onRemove: () => void;
}) {
  const kind: ValuesKind = param.values ? "list" : param.pattern !== undefined ? "pattern" : "any";
  const update = (patch: Partial<UrlParam>) => onChange(withOptionals(param, patch));
  const setKind = (next: ValuesKind) =>
    update({
      values: next === "list" ? [{ value: "a" }] : undefined,
      pattern: next === "pattern" ? "[0-9]+" : undefined,
    });
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className={labelClass}>
          Name
          <Input
            className="h-8 w-36 font-mono text-xs font-normal"
            value={param.name}
            onChange={(e) => update({ name: e.target.value })}
          />
        </label>
        <label className={labelClass}>
          In the URL as
          <Input
            className="h-8 w-36 font-mono text-xs font-normal"
            placeholder={param.name}
            value={param.param ?? ""}
            onChange={(e) => update({ param: e.target.value || undefined })}
          />
        </label>
        <label className={labelClass}>
          Values
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs font-normal"
            value={kind}
            onChange={(e) => setKind(e.target.value as ValuesKind)}
          >
            <option value="any">Any value</option>
            <option value="list">From a list</option>
            <option value="pattern">Matching a pattern</option>
          </select>
        </label>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          aria-label={`Remove ${param.name}`}
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {param.values && (
        <ListValues
          values={param.values.map((v) => v.value)}
          onChange={(list) => update({ values: list.length > 0 ? list.map((value) => ({ value })) : [{ value: "" }] })}
        />
      )}
      {param.pattern !== undefined && (
        <label className={labelClass}>
          Pattern
          <Input
            className="h-8 w-56 font-mono text-xs font-normal"
            placeholder="e.g. [0-9]+"
            value={param.pattern}
            onChange={(e) => update({ pattern: e.target.value })}
          />
        </label>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className={labelClass}>
          Default
          <Input
            className="h-8 w-40 text-xs font-normal"
            placeholder="none: required"
            value={param.default ?? ""}
            onChange={(e) => update({ default: e.target.value || undefined })}
          />
        </label>
        <span className="text-[11px] text-muted-foreground">
          {param.default === undefined
            ? `Required: a link without ?${urlParamKey(param)}= doesn't start.`
            : "Used when the link has none."}
        </span>
      </div>
      <label className={labelClass}>
        Description (optional)
        <Input
          className="h-8 text-xs font-normal"
          value={param.description ?? ""}
          onChange={(e) => update({ description: e.target.value || undefined })}
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
