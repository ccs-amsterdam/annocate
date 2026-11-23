import { useId, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import type { DesignIssue } from "@annotinder/contracts";
import { HelpButton } from "../../../help/HelpButton";
import { IssueList } from "../IssueList";

/** A titled part of a page, with a line of help and a help topic. */
export function Section({
  title,
  help,
  topic,
  children,
}: {
  title: string;
  help?: string;
  topic?: string;
  children: ReactNode;
}) {
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

/**
 * A section of rarely changed settings, folded until opened; closed, its
 * header shows a summary of them. One with an error opens by itself, so
 * nothing wrong stays hidden; its issues are listed at its end.
 */
export function FoldedSection({
  title,
  summary,
  topic,
  issues,
  children,
}: {
  title: string;
  /** The settings in a line, shown while closed. */
  summary: string;
  topic?: string;
  issues: DesignIssue[];
  children: ReactNode;
}) {
  const hasError = issues.some((issue) => !issue.warning);
  const [open, setOpen] = useState(hasError);
  // An error coming up opens it (during render, as React advises for state that follows a prop)
  const [hadError, setHadError] = useState(hasError);
  if (hasError !== hadError) {
    setHadError(hasError);
    if (hasError) setOpen(true);
  }
  const id = useId();
  return (
    <section className="flex flex-col gap-3 rounded-md border border-border/70 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-semibold"
          onClick={() => setOpen(!open)}
        >
          <ChevronRight
            className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          />
          <span className="shrink-0">{title}</span>
          {!open && summary && <span className="truncate font-normal text-muted-foreground">{summary}</span>}
        </button>
        {topic && <HelpButton topic={topic} label={`Help: ${title}`} />}
      </div>
      {open && (
        <div id={id} className="flex flex-col gap-3 pb-1">
          {children}
          <IssueList issues={issues} />
        </div>
      )}
    </section>
  );
}
