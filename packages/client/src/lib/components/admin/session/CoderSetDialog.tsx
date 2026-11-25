import { useState } from "react";
import type { SetGroupResponse } from "@annotinder/contracts";
import { cn } from "cn";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { codersOfKind } from "../../../admin/codersTable";
import { useCodersQuery } from "../../../admin/queries";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ManageCoders } from "./coderSet/ManageCoders";
import { SelectCoders } from "./coderSet/SelectCoders";

const TABS = ["Select coders", "Manage coders"] as const;
type Tab = (typeof TABS)[number];

/**
 * Makes or updates the units' `coder_set` (who codes which units;
 * docs/plans/unit-sets.md) in two tabs: "Select coders", which of the
 * study's expert coders get units and how the units are divided; and
 * "Manage coders", adding expert coders. It opens on "Manage coders" while
 * the study has none: a coder set names expert coders only.
 */
export function CoderSetDialog({
  client,
  groups,
  onDone,
}: {
  client: ResearcherApi;
  groups: SetGroupResponse[];
  /** Closed: made or cancelled. */
  onDone: () => void;
}) {
  const coders = useCodersQuery(client).data?.coders;
  const experts = codersOfKind(coders ?? [], "expert");
  // The tab the researcher chose; until then, by whether there are coders to select
  const [chosen, setChosen] = useState<Tab | null>(null);
  const tab = chosen ?? (experts.length === 0 ? "Manage coders" : "Select coders");

  return (
    <Dialog open onOpenChange={(open) => !open && onDone()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Coder set</DialogTitle>
          <DialogDescription>
            Divides the units over your expert coders, as the units&apos; coder set (
            <span className="font-mono">coder_set</span>). It is a draft until you deploy the units.
          </DialogDescription>
        </DialogHeader>
        <TabList tab={tab} onChange={setChosen} />
        {coders === undefined ? (
          <p className="text-sm text-muted-foreground">Loading coders…</p>
        ) : tab === "Manage coders" ? (
          <ManageCoders client={client} all={coders} experts={experts} />
        ) : experts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expert coders yet: add them under Manage coders.</p>
        ) : (
          <SelectCoders
            client={client}
            groups={groups}
            experts={experts}
            onManage={() => setChosen("Manage coders")}
            onDone={onDone}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TabList({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  return (
    <div role="tablist" aria-label="Coder set" className="flex gap-1 border-b border-border">
      {TABS.map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={tab === t}
          onClick={() => onChange(t)}
          className={cn(
            "-mb-px cursor-pointer border-b-2 px-3 py-1.5 text-sm font-medium transition-colors",
            tab === t
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
