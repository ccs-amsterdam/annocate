import type { CoderResponse } from "@annotinder/contracts";
import type { ResearcherApi } from "../../../../api/httpResearcherApi";
import { AddCodersForm } from "../../coders/AddCodersForm";

/**
 * "Manage coders": adds expert coders, and lists the ones there are. Their
 * email addresses, links and deleting them are on the Coders page.
 */
export function ManageCoders({
  client,
  all,
  experts,
}: {
  client: ResearcherApi;
  /** Every coder of the study: their ids and addresses are taken. */
  all: readonly CoderResponse[];
  experts: readonly CoderResponse[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <AddCodersForm client={client} existing={all} />
      <section className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold">
          {experts.length} expert coder{experts.length === 1 ? "" : "s"}
        </h3>
        {experts.length === 0 ? (
          <p className="text-xs text-muted-foreground">None yet: add the coders who get their own units.</p>
        ) : (
          <ul className="grid max-h-40 gap-x-4 gap-y-0.5 overflow-y-auto rounded-md border border-border p-2 text-xs sm:grid-cols-2">
            {experts.map((c) => (
              <li key={c.coder} className="truncate">
                <span className="font-mono">{c.coder}</span>
                {c.email && <span className="text-muted-foreground"> · {c.email}</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-muted-foreground">
          To change an email address or delete a coder, use the Coders page.
        </p>
      </section>
    </div>
  );
}
