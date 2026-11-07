import { useState, type ReactNode } from "react";
import type { StudyResponse, MeResponse } from "@annotinder/contracts";
import type { ServerApi } from "../../api/serverApi";
import { ResearcherAccess } from "./account/ResearcherAccess";
import { ResearcherApiError, type ResearcherApi } from "../../api/httpResearcherApi";
import { useCreateStudyMutation, useDeleteStudyMutation, useStudiesQuery } from "../../admin/queries";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Plus, Search, FolderOpen, Trash2, Calendar, Archive, Shield, Sparkles, Wand2, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ExamplesDialog } from "./ExamplesDialog";
import { SetupWizard } from "./SetupWizard";
import { HelpButton } from "../../help/HelpButton";

interface StudyListProps {
  client: ResearcherApi;
  /** `editor`: open the study on its Editor tab (after the setup wizard). */
  onSelectStudy: (studyId: number, open?: "editor") => void;
  /** Who is logged in (null: unknown, e.g. a host app without accounts): only researchers create studies. */
  me?: MeResponse | null;
  server?: ServerApi;
  onMe?: (me: MeResponse) => void;
  onOpenServerAdmin?: () => void;
}

export function StudyList({ client, onSelectStudy, me = null, server, onMe, onOpenServerAdmin }: StudyListProps) {
  const canCreate = me?.role !== "user";
  const studiesQuery = useStudiesQuery(client);
  const createStudy = useCreateStudyMutation(client);
  const deleteStudy = useDeleteStudyMutation(client);

  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [newStudyName, setNewStudyName] = useState("");
  const [studyToDelete, setStudyToDelete] = useState<StudyResponse | null>(null);

  if (studiesQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground animate-pulse">Loading studies...</p>
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
  const filteredStudies = studies.filter((j) =>
    j.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudyName.trim()) return;
    createStudy.mutate(
      { name: newStudyName.trim(), archived: false },
      {
        onSuccess: (created) => {
          setNewStudyName("");
          setShowCreateModal(false);
          onSelectStudy(created.id);
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Studies</h1>
          <HelpButton topic="overview" label="Help: getting started" className="align-middle" />
        </div>
        {/* Search & Filter Toolbar */}
        {studies.length > 0 && (
          <div className="relative w-full max-w-xs sm:ml-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search studies..." aria-label="Search studies" className="h-9 pl-9" />
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {me?.role === "admin" && onOpenServerAdmin && <IconButton icon={Shield} label="Server admin" variant="outline" className="h-9 w-9" onClick={onOpenServerAdmin} />}
          {canCreate && (
            <CreateStudyMenu onWizard={() => setShowWizard(true)} onExample={() => setShowExamples(true)} onEmpty={() => setShowCreateModal(true)} />
          )}
        </div>
      </div>

      {me && server && onMe && <ResearcherAccess server={server} me={me} onMe={onMe} />}


      {/* Studies List */}
      {filteredStudies.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <div className="rounded-full bg-primary/10 p-4 text-primary">
            <FolderOpen className="h-8 w-8" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-foreground">
            {studies.length === 0 ? "No studies yet" : "No matching studies"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-xs">
            {studies.length === 0
              ? canCreate
                ? "Get started by creating your first annotation study."
                : "Studies that researchers share with you appear here."
              : `No studies matched the query "${search}".`}
          </p>
          {studies.length === 0 && canCreate && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button onClick={() => setShowWizard(true)} className="gap-2">
                <Wand2 className="h-4 w-4" />
                Guided setup
              </Button>
              <Button onClick={() => setShowExamples(true)} variant="outline" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Start from an example
              </Button>
              <Button onClick={() => setShowCreateModal(true)} variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                Create study
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredStudies.map((study) => (
            <div
              key={study.id}
              role="link"
              tabIndex={0}
              aria-label={`Open ${study.name}`}
              onClick={() => onSelectStudy(study.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSelectStudy(study.id);
              }}
              className="group relative flex cursor-pointer flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-wood/50 hover:bg-wood/5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="line-clamp-2 text-base font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">{study.name}</h3>
                <IconButton
                  icon={Trash2}
                  label={`Delete study ${study.name}`}
                  className="-mr-2 -mt-1 h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                  iconClassName="h-3.5 w-3.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    setStudyToDelete(study);
                  }}
                />
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>
                  {study.created ? new Date(study.created).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "Recently"}
                </span>
                {study.archived && (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium">
                    <Archive className="h-3 w-3" /> Archived
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showExamples && (
        <ExamplesDialog
          client={client}
          onClose={() => setShowExamples(false)}
          onCreated={(study) => {
            setShowExamples(false);
            onSelectStudy(study.id);
          }}
        />
      )}

      {showWizard && (
        <SetupWizard
          client={client}
          onClose={() => setShowWizard(false)}
          onCreated={(study) => {
            setShowWizard(false);
            onSelectStudy(study.id, "editor");
          }}
        />
      )}

      {/* Create Study Dialog Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-foreground">Create New Study</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter a descriptive name for your annotation study.
            </p>
            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Study Name
                </label>
                <Input
                  autoFocus
                  placeholder="e.g. Sentiment Analysis Phase 1"
                  value={newStudyName}
                  onChange={(e) => setNewStudyName(e.target.value)}
                  required
                />
              </div>

              {createStudy.isError && (
                <p className="text-xs text-destructive">
                  {createStudy.error instanceof ResearcherApiError ? createStudy.error.reason : createStudy.error.message}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewStudyName("");
                  }}
                  disabled={createStudy.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createStudy.isPending || !newStudyName.trim()}>
                  {createStudy.isPending ? "Creating..." : "Create Study"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Study Confirmation Modal */}
      {studyToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-foreground">Delete Study</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to delete <strong className="text-foreground">{studyToDelete.name}</strong>?
              This will permanently delete all its designVersions, units, and coder annotations.
            </p>

            {deleteStudy.isError && (
              <p className="mt-2 text-xs text-destructive">{deleteStudy.error.message}</p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStudyToDelete(null)}
                disabled={deleteStudy.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={deleteStudy.isPending}
                onClick={() => {
                  deleteStudy.mutate(studyToDelete.id, {
                    onSuccess: () => setStudyToDelete(null),
                  });
                }}
              >
                {deleteStudy.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** "Create new study": the guided setup, an example, or an empty study. */
function CreateStudyMenu({ onWizard, onExample, onEmpty }: { onWizard: () => void; onExample: () => void; onEmpty: () => void }) {
  const [open, setOpen] = useState(false);
  const item = (icon: ReactNode, title: string, text: string, onClick: () => void) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setOpen(false);
        onClick();
      }}
      className="flex w-full items-start gap-2.5 rounded-md p-2 text-left hover:bg-muted"
    >
      <span className="mt-0.5 text-primary">{icon}</span>
      <span>
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block text-xs text-muted-foreground">{text}</span>
      </span>
    </button>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button className="w-fit gap-2 shadow-sm">
          <Plus className="h-4 w-4" />
          Create new study
          <ChevronDown className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1.5" role="menu">
        {item(<Wand2 className="h-4 w-4" />, "Guided setup", "Units, who codes what and your questions, step by step.", onWizard)}
        {item(<Sparkles className="h-4 w-4" />, "From an example", "A ready study to try and change.", onExample)}
        {item(<Plus className="h-4 w-4" />, "Empty study", "Start from scratch in the editor.", onEmpty)}
      </PopoverContent>
    </Popover>
  );
}
