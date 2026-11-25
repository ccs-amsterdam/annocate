import type { StudyResponse } from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useDeleteStudyMutation } from "../../../admin/queries";
import { studyNameConfirmed } from "../../../admin/confirmDeletion";
import { ConfirmDeletionDialog } from "../ConfirmDeletionDialog";

/** Deleting a study: says what goes, and asks to type the study's name. `onDeleted`: after it is deleted. */
export function DeleteStudyDialog({
  client,
  study,
  onClose,
  onDeleted,
}: {
  client: ResearcherApi;
  study: StudyResponse;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const deleteStudy = useDeleteStudyMutation(client);
  return (
    <ConfirmDeletionDialog
      title="Delete this study"
      expected={study.name}
      confirmed={(typed) => studyNameConfirmed(typed, study.name)}
      onDelete={async (confirm) => {
        await deleteStudy.mutateAsync({ id: study.id, confirm });
        onDeleted();
      }}
      onClose={onClose}
    >
      <p>
        This permanently deletes the study <strong className="text-foreground">{study.name}</strong>: its design
        versions, units, coders and their answers, sessions and results downloads.
      </p>
      <p>It can&apos;t be undone.</p>
    </ConfirmDeletionDialog>
  );
}
