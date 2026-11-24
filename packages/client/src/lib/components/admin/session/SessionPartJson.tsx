import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import type { DesignIssue, SessionItem } from "@annotinder/contracts";
import { IssueList } from "../IssueList";
import { JsonCodeEditor, SESSION_PART_MODEL } from "../jsonEditor/JsonCodeEditor";
import type { SessionTab } from "./sessionTab";
import { withSessionPart } from "../../../design/itemSettings";

const show = (value: unknown) => JSON.stringify(value ?? null, null, 2);

/**
 * One part of the Study entry as JSON: `invite`, `urlParams` or `display`
 * (absent: null). Applied on every edit that parses; validation checks it.
 */
export function SessionPartJson({
  item,
  part,
  issues,
  readOnly,
  onChange,
}: {
  item: SessionItem;
  part: SessionTab;
  issues: DesignIssue[];
  readOnly: boolean;
  onChange: (item: SessionItem) => void;
}) {
  const [text, setText] = useState(() => show(item[part]));
  const [error, setError] = useState<string | null>(null);
  /** The part as last applied from here, so the draft echoing it back doesn't reset the text. */
  const applied = useRef(show(item[part]));

  // Changes from elsewhere (the form, undo) replace the text
  useEffect(() => {
    const json = show(item[part]);
    if (json === applied.current) return;
    applied.current = json;
    setText(json);
    setError(null);
  }, [item, part]);

  function edit(next: string) {
    setText(next);
    let value: unknown;
    try {
      value = JSON.parse(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    setError(null);
    applied.current = show(value);
    onChange(withSessionPart(item, part, value));
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="min-h-[320px] flex-1 overflow-hidden rounded-lg border border-border">
        <JsonCodeEditor model={SESSION_PART_MODEL} value={text} onChange={edit} readOnly={readOnly} />
      </div>
      {error ? (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Not applied: {error}
        </p>
      ) : (
        <IssueList issues={issues} />
      )}
    </div>
  );
}
