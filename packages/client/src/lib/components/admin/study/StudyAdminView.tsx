import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { LogoSmoke } from "@/components/Logo";
import { ResearcherApiError, type ResearcherApi } from "../../../api/httpResearcherApi";
import { useStudiesQuery, useStudyQuery } from "../../../admin/queries";
import type { TabId } from "../../../admin/tabs";
import type { DesignBackup } from "../../../design/localBackup";
import type { LeaveGuard } from "../AdminApp";
import { GuideDialog } from "../guide/GuideDialog";
import { GuidePrompt } from "../guide/GuidePrompt";
import { ShowMe } from "../guide/ShowMe";
import { PendingDeployBar } from "../PendingDeployBar";
import { UnsavedChangesDialog } from "../UnsavedChangesDialog";
import { StudyHeader } from "./StudyHeader";
import { StudyPage } from "./StudyPage";
import { useSaveBeforeLeaving, type AskFirst } from "./useSaveBeforeLeaving";

/** A study's pages: the header with its sections, and the current page. Navigation goes through the URL. */
export function StudyAdminView({
  banner,
  restore,
  client,
  rootClient,
  coderApiUrl,
  tab,
  version,
  onTabChange,
  onVersionChange,
  onBackToStudies,
  onSwitchStudy,
  useLeaveGuard,
}: {
  /** Offers unsaved design edits from an earlier session, if any; continuing with them asks first (`askFirst`). */
  banner: (askFirst: AskFirst) => ReactNode;
  /** Those edits, once the researcher chose to continue with them. */
  restore: DesignBackup | null;
  client: ResearcherApi;
  rootClient: ResearcherApi;
  coderApiUrl?: string;
  tab: TabId;
  /** The editor's version (its number), from the URL. */
  version?: number;
  onTabChange: (tab: TabId) => void;
  onVersionChange: (version: number | undefined) => void;
  onBackToStudies: () => void;
  onSwitchStudy: (studyId: number) => void;
  useLeaveGuard: LeaveGuard;
}) {
  const studyQuery = useStudyQuery(client);
  const allStudiesQuery = useStudiesQuery(rootClient);
  const study = studyQuery.data;
  const unsaved = useSaveBeforeLeaving(useLeaveGuard, client.studyId!, tab === "Design");
  // A design version to open, from the overview; `n` remounts the manager on each request
  const [designTarget, setDesignTarget] = useState<{ id: number; n: number } | null>(null);

  // Nothing of a study shows before it is known: loading, then the study, or why there is none
  if (studyQuery.isPending)
    return (
      <div className="flex h-full items-center justify-center bg-page p-8">
        <LogoSmoke label="Loading study…" />
      </div>
    );
  if (!study) return <NoStudy error={studyQuery.error} onBack={onBackToStudies} />;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-page">
      <StudyHeader
        study={study}
        studies={allStudiesQuery.data ?? []}
        tab={tab}
        onTabChange={onTabChange}
        onBackToStudies={onBackToStudies}
        onSwitchStudy={onSwitchStudy}
      />

      {/* The editor fills the height, its panes scroll on their own (on a low window, with a minimum height: then
          the page scrolls); other pages scroll as a whole */}
      <main
        className={
          tab === "Design"
            ? "flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pt-2 pb-3 sm:px-4"
            : "min-h-0 flex-1 overflow-auto p-4 sm:p-6"
        }
      >
        {banner(unsaved.askFirst)}
        {/* Elsewhere, what isn't deployed yet, with the way to the Deploy page (the editor's banner says it there) */}
        {tab !== "Design" && tab !== "Deploy" && (
          <PendingDeployBar client={client} onOpenDeploy={() => onTabChange("Deploy")} />
        )}
        <StudyPage
          tab={tab}
          client={client}
          coderApiUrl={coderApiUrl}
          goTo={onTabChange}
          onBackToStudies={onBackToStudies}
          design={{
            target: designTarget,
            open: (id) =>
              unsaved.askFirst(() => {
                setDesignTarget((t) => ({ id, n: (t?.n ?? 0) + 1 }));
                onTabChange("Design");
              }),
            version,
            onVersionChange,
            restore,
            onDirtyChange: unsaved.setDirty,
            registerSave: unsaved.registerSave,
          }}
        />
      </main>

      <GuideDialog onGoTo={onTabChange} />
      <ShowMe />
      <GuidePrompt />
      <UnsavedChangesDialog {...unsaved.dialog} />
    </div>
  );
}

/** Why a study can't be shown. */
function noStudyMessage(error: Error | null): string {
  if (error === null) return "This study doesn't exist (any more).";
  if (!(error instanceof ResearcherApiError)) return `The study couldn't be loaded: ${error.message}`;
  if (error.status === 403) return "You don't have access to this study.";
  return `The study couldn't be loaded: ${error.reason}`;
}

/** A study that doesn't exist (or the researcher can't open): why, and the way back to the studies. */
function NoStudy({ error, onBack }: { error: Error | null; onBack: () => void }) {
  return (
    <div className="flex h-full items-center justify-center bg-page p-8">
      <div role="alert" className="flex max-w-sm flex-col items-center gap-3 text-center">
        <p className="text-base font-semibold text-foreground">Study not found</p>
        <p className="text-sm text-muted-foreground">{noStudyMessage(error)}</p>
        <Button type="button" variant="outline" onClick={onBack}>
          Back to your studies
        </Button>
      </div>
    </div>
  );
}
