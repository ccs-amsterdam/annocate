import { useState } from "react";
import type { StudyResponse, MeResponse } from "@annotinder/contracts";
import type { ServerApi } from "../../api/serverApi";
import { ResearcherAccess } from "./account/ResearcherAccess";
import { type ResearcherApi } from "../../api/httpResearcherApi";
import { useStudiesQuery } from "../../admin/queries";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Plus, Search, FolderOpen, Shield, Sparkles } from "lucide-react";
import { ExamplesDialog } from "./ExamplesDialog";
import { ImportStudyDialog } from "./ImportStudyDialog";
import { HelpButton } from "../../help/HelpButton";
import { requestGuidePrompt } from "./guide/guideStore";
import { CreateStudyDialog } from "./studyList/CreateStudyDialog";
import { CreateStudyMenu } from "./studyList/CreateStudyMenu";
import { DeleteStudyDialog } from "./studyList/DeleteStudyDialog";
import { StudyCard } from "./studyList/StudyCard";

interface StudyListProps {
  client: ResearcherApi;
  /** `design`: open the study on its Design page (a new study). */
  onSelectStudy: (studyId: number, open?: "design") => void;
  /** Who is logged in (null: unknown, e.g. a host app without accounts): only researchers create studies. */
  me?: MeResponse | null;
  server?: ServerApi;
  onMe?: (me: MeResponse) => void;
  onOpenServerAdmin?: () => void;
}

/** The researcher's studies: search, open, delete, and (for researchers) create one: empty, from an example or from a file. */
export function StudyList({ client, onSelectStudy, me = null, server, onMe, onOpenServerAdmin }: StudyListProps) {
  const canCreate = me?.role !== "user";
  const studiesQuery = useStudiesQuery(client);
  const [search, setSearch] = useState("");
  // The open dialog: a way to create a study
  const [creating, setCreating] = useState<"empty" | "example" | "file" | null>(null);
  const [studyToDelete, setStudyToDelete] = useState<StudyResponse | null>(null);

  if (studiesQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="animate-pulse text-sm text-muted-foreground">Loading studies...</p>
      </div>
    );
  }

  if (studiesQuery.isError) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
        <p className="font-medium text-destructive">Failed to load studies</p>
        <p className="mt-1 text-sm text-muted-foreground">{studiesQuery.error.message}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => studiesQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const studies = studiesQuery.data ?? [];
  const filteredStudies = studies.filter((j) => j.name.toLowerCase().includes(search.toLowerCase()));
  // A new study opens; the researcher's first one asks whether to take the guide
  const openNew = (study: StudyResponse, open?: "design") => {
    setCreating(null);
    if (studies.length === 0) requestGuidePrompt();
    onSelectStudy(study.id, open);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Studies</h1>
          <HelpButton topic="overview" label="Help: getting started" className="align-middle" />
        </div>
        {studies.length > 0 && (
          <div className="relative w-full max-w-xs sm:ml-4">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search studies..."
              aria-label="Search studies"
              className="h-9 pl-9"
            />
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {me?.role === "admin" && onOpenServerAdmin && (
            <IconButton
              icon={Shield}
              label="Server admin"
              variant="outline"
              className="h-9 w-9"
              onClick={onOpenServerAdmin}
            />
          )}
          {canCreate && (
            <CreateStudyMenu
              onExample={() => setCreating("example")}
              onImport={() => setCreating("file")}
              onEmpty={() => setCreating("empty")}
            />
          )}
        </div>
      </div>

      {me && server && onMe && <ResearcherAccess server={server} me={me} onMe={onMe} />}

      {filteredStudies.length === 0 ? (
        <NoStudies
          search={studies.length === 0 ? null : search}
          canCreate={canCreate}
          onEmpty={() => setCreating("empty")}
          onExample={() => setCreating("example")}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredStudies.map((study) => (
            <StudyCard
              key={study.id}
              study={study}
              onOpen={() => onSelectStudy(study.id)}
              onDelete={() => setStudyToDelete(study)}
            />
          ))}
        </div>
      )}

      {creating === "example" && (
        <ExamplesDialog client={client} onClose={() => setCreating(null)} onCreated={(study) => openNew(study)} />
      )}
      {creating === "file" && (
        <ImportStudyDialog
          client={client}
          onClose={() => setCreating(null)}
          onCreated={(study) => openNew(study, "design")}
        />
      )}
      {creating === "empty" && (
        <CreateStudyDialog
          client={client}
          onClose={() => setCreating(null)}
          onCreated={(study) => openNew(study, "design")}
        />
      )}
      {studyToDelete && (
        <DeleteStudyDialog
          client={client}
          study={studyToDelete}
          onClose={() => setStudyToDelete(null)}
          onDeleted={() => setStudyToDelete(null)}
        />
      )}
    </div>
  );
}

/** Nothing to list: no studies yet (with the ways to start, for who may create one), or none that match the search. */
function NoStudies({
  search,
  canCreate,
  onEmpty,
  onExample,
}: {
  /** What was searched for; null: there are no studies at all. */
  search: string | null;
  canCreate: boolean;
  onEmpty: () => void;
  onExample: () => void;
}) {
  const none = search === null;
  const noneText = canCreate
    ? "Get started by creating your first annotation study."
    : "Studies that researchers share with you appear here.";
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-12 text-center">
      <div className="rounded-full bg-primary/10 p-4 text-primary">
        <FolderOpen className="h-8 w-8" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">
        {none ? "No studies yet" : "No matching studies"}
      </h3>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
        {none ? noneText : `No studies matched the query "${search}".`}
      </p>
      {none && canCreate && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={onEmpty} className="gap-2">
            <Plus className="h-4 w-4" />
            Create study
          </Button>
          <Button onClick={onExample} variant="outline" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Start from an example
          </Button>
        </div>
      )}
    </div>
  );
}
