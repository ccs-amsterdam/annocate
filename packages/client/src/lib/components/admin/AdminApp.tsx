import { useState, useMemo, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CoderInviteResponse } from "@annotinder/contracts";
import type { AdminClient } from "../../api/httpAdminClient";
import { useJobQuery, useJobsQuery } from "../../admin/queries";
import { JobList } from "./JobList";
import { CodebookManager } from "./CodebookManager";
import type { SaveFn } from "./CodebookEditor";
import { UnitsPage } from "./units/UnitsPage";
import { CodersPanel } from "./CodersPanel";
import { InvitationsPanel } from "./InvitationsPanel";
import { JobOverview } from "./overview/JobOverview";
import { JobPreview } from "./JobPreview";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, LayoutDashboard, BookOpen, Layers, Link2, Users, Play, Archive } from "lucide-react";

const TABS = [
  { id: "Overview", label: "Overview", icon: LayoutDashboard },
  { id: "Codebook", label: "Codebook", icon: BookOpen },
  { id: "Units", label: "Units", icon: Layers },
  { id: "Invitations", label: "Invitations", icon: Link2 },
  { id: "Coders", label: "Coders", icon: Users },
  { id: "Preview", label: "Preview", icon: Play },
] as const;

type TabId = (typeof TABS)[number]["id"];

const defaultQueryClient = new QueryClient();

export function AdminApp({
  client,
  baseUrl,
  initialJobId,
  queryClient,
  inviteUrl,
  jobServerUrl,
}: {
  client: AdminClient;
  /** The researcher API's base URL. */
  baseUrl: string;
  initialJobId?: number;
  queryClient?: QueryClient;
  /** Builds the link coders open for an invite (host-app specific). */
  inviteUrl?: (invite: CoderInviteResponse) => string;
  /** Where coder sessions run (`<url>/d/...`), for previews; normally the client's own origin (""), since their cookies are same-origin. */
  jobServerUrl?: string;
}) {
  return (
    <QueryClientProvider client={queryClient ?? defaultQueryClient}>
      <AdminAppInner
        client={client}
        baseUrl={baseUrl}
        initialJobId={initialJobId}
        inviteUrl={inviteUrl}
        jobServerUrl={jobServerUrl}
      />
    </QueryClientProvider>
  );
}

function AdminAppInner({
  client,
  baseUrl,
  initialJobId,
  inviteUrl,
  jobServerUrl,
}: {
  client: AdminClient;
  baseUrl: string;
  initialJobId?: number;
  inviteUrl?: (invite: CoderInviteResponse) => string;
  jobServerUrl?: string;
}) {
  const [selectedJobId, setSelectedJobId] = useState<number | null>(initialJobId ?? null);
  const [tab, setTab] = useState<TabId>("Overview");

  // If a job is selected, create a client scoped to that job
  const jobClient = useMemo(() => {
    if (selectedJobId === null) return null;
    return client.forJob(selectedJobId);
  }, [client, selectedJobId]);

  if (selectedJobId === null || !jobClient) {
    return (
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <JobList client={client} onSelectJob={(id) => setSelectedJobId(id)} />
      </div>
    );
  }

  return (
    <JobAdminView
      client={jobClient}
      rootClient={client}
      baseUrl={baseUrl}
      inviteUrl={inviteUrl}
      jobServerUrl={jobServerUrl}
      tab={tab}
      onTabChange={setTab}
      onBackToJobs={() => setSelectedJobId(null)}
      onSwitchJob={(id) => setSelectedJobId(id)}
    />
  );
}

function JobAdminView({
  client,
  rootClient,
  baseUrl,
  inviteUrl,
  jobServerUrl,
  tab,
  onTabChange,
  onBackToJobs,
  onSwitchJob,
}: {
  client: AdminClient;
  rootClient: AdminClient;
  baseUrl: string;
  inviteUrl?: (invite: CoderInviteResponse) => string;
  jobServerUrl?: string;
  tab: TabId;
  onTabChange: (tab: TabId) => void;
  onBackToJobs: () => void;
  onSwitchJob: (jobId: number) => void;
}) {
  const jobQuery = useJobQuery(client);
  const allJobsQuery = useJobsQuery(rootClient);
  const job = jobQuery.data;

  const [isCodebookDirty, setIsCodebookDirty] = useState(false);
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);
  const saveCodebook = useRef<SaveFn | null>(null);
  // A codebook version to open, from the overview; `n` remounts the manager on each request
  const [codebookTarget, setCodebookTarget] = useState<{ id: number; n: number } | null>(null);
  const [savingCodebook, setSavingCodebook] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function saveAndNavigate() {
    setSavingCodebook(true);
    setSaveError(null);
    try {
      await saveCodebook.current?.();
      setIsCodebookDirty(false);
      const nav = pendingNav;
      setPendingNav(null);
      nav?.();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingCodebook(false);
    }
  }

  function requestNavigation(action: () => void) {
    if (isCodebookDirty && tab === "Codebook") {
      setPendingNav(() => action);
    } else {
      action();
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Top Header / Breadcrumb */}
      <header className="border-b border-border bg-card/60 px-4 py-3 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => requestNavigation(onBackToJobs)}
              className="gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
              All Jobs
            </Button>
            <span className="text-muted-foreground/50">/</span>

            {/* Job Switcher Dropdown / Name */}
            <div className="flex items-center gap-2">
              <select
                value={client.jobId}
                onChange={(e) => {
                  const newId = Number(e.target.value);
                  requestNavigation(() => onSwitchJob(newId));
                }}
                className="rounded-md border border-input bg-background px-2 py-1 text-sm font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {allJobsQuery.data?.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name} (#{j.id})
                  </option>
                ))}
              </select>

              {job?.archived && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  <Archive className="h-3 w-3" /> Archived
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant={tab === "Preview" ? "default" : "outline"}
              size="sm"
              onClick={() => requestNavigation(() => onTabChange("Preview"))}
              className="gap-1.5 text-xs"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              Preview Job
            </Button>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="mt-3 flex gap-1 overflow-x-auto border-t border-border/40 pt-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => requestNavigation(() => onTabChange(t.id))}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Main Tab Content */}
      <main className="flex-1 overflow-auto p-4 sm:p-6">
        {tab === "Overview" && (
          <JobOverview
            client={client}
            onNavigate={onTabChange}
            onOpenCodebook={(id) => {
              setCodebookTarget((t) => ({ id, n: (t?.n ?? 0) + 1 }));
              onTabChange("Codebook");
            }}
            onDeleted={onBackToJobs}
          />
        )}
        {tab === "Codebook" && (
          <CodebookManager
            key={codebookTarget?.n ?? 0}
            initialVersionId={codebookTarget?.id ?? null}
            client={client}
            onDirtyChange={setIsCodebookDirty}
            registerSave={(save) => {
              saveCodebook.current = save;
            }}
          />
        )}
        {tab === "Units" && <UnitsPage client={client} />}
        {tab === "Invitations" && <InvitationsPanel client={client} baseUrl={baseUrl} inviteUrl={inviteUrl} />}
        {tab === "Coders" && <CodersPanel client={client} />}
        {tab === "Preview" && <JobPreview client={client} jobServerUrl={jobServerUrl} />}
      </main>

      {/* Unsaved Changes Confirmation Modal */}
      <UnsavedChangesDialog
        open={pendingNav !== null}
        isSaving={savingCodebook}
        error={saveError}
        onCancel={() => {
          setPendingNav(null);
          setSaveError(null);
        }}
        onDiscard={() => {
          setIsCodebookDirty(false);
          const nav = pendingNav;
          setPendingNav(null);
          setSaveError(null);
          nav?.();
        }}
        onSave={saveAndNavigate}
      />
    </div>
  );
}
