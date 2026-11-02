import type { DesignIssue } from "@annotinder/contracts";

/** Issues whose path continues with `prefix` after the item's own path (e.g. `["condition"]`). */
export function issuesAt(issues: DesignIssue[], ...prefix: (string | number)[]): DesignIssue[] {
  return issues.filter((issue) => {
    for (let i = 0; i + prefix.length <= issue.path.length; i++) {
      if (prefix.every((p, j) => issue.path[i + j] === p)) return true;
    }
    return false;
  });
}
