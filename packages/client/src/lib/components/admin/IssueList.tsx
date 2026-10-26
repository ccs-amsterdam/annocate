import type { CodebookValidationIssue } from "@annotinder/contracts";

/** Validation messages under a field: errors in red, warnings in amber. */
export function IssueList({ issues }: { issues: CodebookValidationIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="flex flex-col gap-0.5">
      {issues.map((issue, i) => (
        <li key={i} className={`text-xs ${issue.warning ? "text-amber-600 dark:text-amber-400" : "text-destructive"}`}>
          {issue.message}
        </li>
      ))}
    </ul>
  );
}
