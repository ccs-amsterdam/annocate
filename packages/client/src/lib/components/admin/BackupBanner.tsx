import type { ResearcherApi } from "../../api/httpResearcherApi";
import { useStudiesQuery } from "../../admin/queries";
import { Button } from "@/components/ui/button";
import { FilePen } from "lucide-react";
import { type DesignBackup } from "../../design/localBackup";

/** Offers unsaved design edits from an earlier session (the browser was closed): continue with them, or throw them away. */
export function BackupBanner({
  client,
  backup,
  onContinue,
  onDiscard,
}: {
  client: ResearcherApi;
  backup: DesignBackup;
  onContinue: () => void;
  onDiscard: () => void;
}) {
  const studies = useStudiesQuery(client);
  const study = studies.data?.find((s) => s.id === backup.studyId);
  const when = new Date(backup.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500 bg-amber-500/10 px-4 py-3 text-sm">
      <div className="flex items-start gap-2.5">
        <FilePen className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <p className="font-semibold text-foreground">You have unsaved changes in the design editor</p>
          <p className="text-muted-foreground">
            In {study ? `"${study.name}"` : `study #${backup.studyId}`}, from {when}. They were kept in this browser.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onDiscard}>
          Discard
        </Button>
        <Button size="sm" onClick={onContinue}>
          Continue editing
        </Button>
      </div>
    </div>
  );
}
