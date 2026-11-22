import type { DesignIssue, DesignItem, EndItem } from "@annotinder/contracts";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { HelpButton } from "../../../help/HelpButton";
import { IssueList } from "../IssueList";
import { issuesAt } from "../issues";

/**
 * An end item's outcome, message and where coders are sent next. With
 * `studyEnd`: the study's normal end, which has no outcome (always complete).
 */
export function EndItemFields({
  item,
  onChange,
  issues,
  studyEnd = false,
}: {
  item: EndItem;
  onChange: (updated: DesignItem) => void;
  issues: DesignIssue[];
  studyEnd?: boolean;
}) {
  return (
    <div className={studyEnd ? "flex flex-col gap-3" : "flex flex-col gap-3 border-t border-border/60 pt-4"}>
      <div className={studyEnd ? "hidden" : "flex flex-col gap-1.5"}>
        <span className="flex items-center gap-1.5">
          <label className="text-xs font-semibold text-foreground">Outcome</label>
          <HelpButton topic="end-items" label="Help: ending a session" />
        </span>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-xs"
          value={item.outcome}
          onChange={(e) => onChange({ ...item, outcome: e.target.value as EndItem["outcome"] })}
        >
          <option value="screenout">Screened out (not eligible)</option>
          <option value="complete">Complete</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-foreground">Message (optional)</label>
        <Textarea
          value={item.message ?? ""}
          rows={3}
          onChange={(e) => onChange({ ...item, message: e.target.value || undefined })}
          placeholder="Thank you for your time."
        />
        <IssueList issues={issuesAt(issues, "message")} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-foreground">Then send coders to</label>
        <select
          aria-label="Redirect"
          className="h-8 w-fit rounded-md border border-input bg-background px-2 text-xs"
          value={item.redirectSetting !== undefined ? "setting" : item.redirectUrl !== undefined ? "url" : ""}
          onChange={(e) => {
            const next: EndItem = { ...item };
            delete next.redirectUrl;
            delete next.redirectSetting;
            if (e.target.value === "url") next.redirectUrl = "";
            // Separate settings by default: panels give a return link per outcome
            if (e.target.value === "setting")
              next.redirectSetting = item.outcome === "screenout" ? "panel_screenout" : "panel_return";
            onChange(next);
          }}
        >
          <option value="">Nowhere: they stay on the end screen</option>
          <option value="setting">A panel's return link (set per run, in the study's Settings)</option>
          <option value="url">This URL</option>
        </select>
        {item.redirectSetting !== undefined && (
          <>
            <Input
              aria-label="Setting name"
              value={item.redirectSetting}
              onChange={(e) => onChange({ ...item, redirectSetting: e.target.value })}
              placeholder="panel_complete"
              className="w-60 font-mono text-xs"
            />
            <span className="text-[11px] text-muted-foreground">
              The URL itself goes in the study&apos;s Settings, under this name: a panel gives each run its own links.
            </span>
          </>
        )}
        {item.redirectUrl !== undefined && (
          <Input
            value={item.redirectUrl}
            onChange={(e) => onChange({ ...item, redirectUrl: e.target.value })}
            placeholder="https://example.org/thanks?id=$var.pid.value"
            className="font-mono text-xs"
          />
        )}
        <IssueList issues={[...issuesAt(issues, "redirectUrl"), ...issuesAt(issues, "redirectSetting")]} />
      </div>
    </div>
  );
}
