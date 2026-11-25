import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { invitedKind, unassignedText } from "../../../admin/codersTable";
import { useCodersQuery } from "../../../admin/queries";
import { useCurrentInvite } from "../../../admin/studyInvite";

/**
 * Says how many units no expert coder has (deployed, e.g. after a coder was
 * deleted, and in the draft), where the study has expert coders. `children`:
 * what to do about it from this page (a button, a link).
 */
export function UnassignedNotice({ client, children }: { client: ResearcherApi; children?: ReactNode }) {
  const { invite } = useCurrentInvite(client);
  const unassigned = useCodersQuery(client).data?.unassigned;
  const text = unassigned ? unassignedText(unassigned, invitedKind(invite)) : null;
  if (text === null) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-amber-500/50 bg-amber-500/10 p-2.5 text-sm"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <span>{text}</span>
      {children}
    </div>
  );
}
