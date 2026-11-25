import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { codersOfKind } from "../../../admin/codersTable";
import { useCodersQuery, useWhoCodes } from "../../../admin/queries";
import { Button } from "@/components/ui/button";

/** The study's expert coders in a line, with the way to the Coders page (where they are added, changed and followed). */
export function CodersSummary({ client, onOpenCoders }: { client: ResearcherApi; onOpenCoders: () => void }) {
  const kind = useWhoCodes(client)?.kind;
  const coders = useCodersQuery(client).data?.coders;
  if (kind !== "expert" || !coders) return null;
  const experts = codersOfKind(coders, "expert");
  const withUnits = experts.filter((c) => (c.assignedDraft ?? 0) > 0).length;
  return (
    <p className="text-xs text-muted-foreground">
      {experts.length} expert coder{experts.length === 1 ? "" : "s"}, {withUnits} with units in the draft.{" "}
      <Button variant="link" className="h-auto p-0 text-xs" onClick={onOpenCoders}>
        Coders
      </Button>
    </p>
  );
}
