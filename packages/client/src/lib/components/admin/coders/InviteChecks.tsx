import { AlertTriangle, CircleAlert } from "lucide-react";
import { CODER_SET, coderInviteChecks, type Invite } from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useCodersQuery, useSetGroupsQuery } from "../../../admin/queries";
import { columnValues } from "../../../design/assignment";

/**
 * What an invitation asks of the coders of the draft's coder set, as the
 * server checks it when the units are deployed (contracts
 * `coderInviteChecks`): coders without an email address where they sign in
 * (deploying is refused), and coder ids that look like email addresses
 * where coders pick their name (a warning).
 */
export function InviteChecks({ client, invite }: { client: ResearcherApi; invite: Invite }) {
  const groups = useSetGroupsQuery(client).data;
  const coders = useCodersQuery(client).data?.coders;
  // Nothing to say before both are known: a coder not read yet would count as one without an address
  if (!groups || !coders) return null;
  const emails = new Map(coders.map((c) => [c.coder, c.email]));
  const assigned = columnValues(groups, CODER_SET).map((coder) => ({ coder, email: emails.get(coder) ?? null }));
  const { errors, warnings } = coderInviteChecks(invite, assigned);
  if (errors.length + warnings.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {errors.map((error) => (
        <li key={error} className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          {error}
        </li>
      ))}
      {warnings.map((warning) => (
        <li key={warning} className="flex gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          {warning}
        </li>
      ))}
    </ul>
  );
}
