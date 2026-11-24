import type { StudyResponse } from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useDeleteStudyMutation } from "../../../admin/queries";
import { Button } from "@/components/ui/button";

/** Deleting a study: asks first. */
export function DeleteStudyDialog({
  client,
  study,
  onClose,
}: {
  client: ResearcherApi;
  study: StudyResponse;
  onClose: () => void;
}) {
  const deleteStudy = useDeleteStudyMutation(client);
  return (
    <div className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-black/50 p-4 backdrop-blur-sm fade-in">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">Delete Study</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Are you sure you want to delete <strong className="text-foreground">{study.name}</strong>? This will
          permanently delete all its designVersions, units, and coder annotations.
        </p>

        {deleteStudy.isError && <p className="mt-2 text-xs text-destructive">{deleteStudy.error.message}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={deleteStudy.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleteStudy.isPending}
            onClick={() => deleteStudy.mutate(study.id, { onSuccess: onClose })}
          >
            {deleteStudy.isPending ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}
