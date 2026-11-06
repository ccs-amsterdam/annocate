import { useState, useMemo, useRef, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MeResponse } from "@annotinder/contracts";
import type { ServerApi } from "../../api/serverApi";
import { ServerAdmin } from "./server/ServerAdmin";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import { useJobQuery, useJobsQuery } from "../../admin/queries";
import { JobList } from "./JobList";
import { DesignManager } from "./DesignManager";
import type { SaveFn } from "./DesignEditor";
import { UnitsPage } from "./units/UnitsPage";
import { CodersPanel } from "./CodersPanel";
import { ResultsPanel } from "./ResultsPanel";
import { LinksPanel } from "./LinksPanel";
import { JobOverview, JobSettingsPage } from "./overview/JobOverview";
import { JobPreview } from "./JobPreview";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { CollapsibleHeader } from "../../hooks/useCollapsingChrome";
import {
  ChevronLeft,
  LayoutDashboard,
  BookOpen,
  Layers,
  Link2,
  Users,
  Play,
  Archive,
  FilePen,
  Download,
  CircleHelp,
  PencilRuler,
  Send,
  Settings,
} from "lucide-react";
import { clearBackup, readBackup, type DesignBackup } from "../../design/localBackup";
import { HelpDialog } from "../../help/HelpDialog";
import { PendingDeployBar } from "./PendingDeployBar";
import { openHelp } from "../../help/helpStore";

/** The job's pages. Preview is opened with the Preview Job button, not from the tabs. */
export type TabId = "Overview" | "Editor" | "Units" | "Links" | "Coders" | "Results" | "Settings" | "Preview";

/** Each page's name in the URL (`/research/jobs/<id>/<slug>`). */
export const TAB_SLUGS: Record<TabId, string> = {
  Overview: "overview",
  Editor: "editor",
  Units: "units",
  Links: "links",
  Coders: "coders",
  Results: "results",
  Settings: "settings",
  Preview: "preview",
};

/**
 * Where the researcher is (the app's URL, router.tsx): the jobs, the server
 * admin's page, or a job's page (the editor on a version: its number, v1, v2, ...).
 */
export type AdminLocation = { page: "jobs" } | { page: "server" } | { page: "job"; jobId: number; tab: TabId; version?: number };

/**
 * Asks before leaving a page with unsaved edits (when `when`), e.g. the
 * router's blocker: `blocked` while it waits for an answer, then `proceed`
 * or `stay`. Without one (tests), nothing is asked.
 */
export type LeaveGuard = (when: boolean) => { blocked: boolean; proceed: () => void; stay: () => void };
const noGuard: LeaveGuard = () => ({ blocked: false, proceed: () => {}, stay: () => {} });

/**
 * The tabs, grouped: designing the job (codebook, units), deploying it
 * (links, coders), its results, and settings. A group with more than
 * one page shows them as sub tabs.
 */
const GROUPS: { label: string; icon: typeof LayoutDashboard; pages: { id: TabId; label: string; icon: typeof LayoutDashboard }[] }[] = [
  { label: "Overview", icon: LayoutDashboard, pages: [{ id: "Overview", label: "Overview", icon: LayoutDashboard }] },
  {
    label: "Design",
    icon: PencilRuler,
    pages: [
      { id: "Editor", label: "Editor", icon: BookOpen },
      { id: "Units", label: "Units", icon: Layers },
    ],
  },
  {
    label: "Deploy",
    icon: Send,
    pages: [
      { id: "Links", label: "Links", icon: Link2 },
      { id: "Coders", label: "Coders", icon: Users },
    ],
  },
  { label: "Results", icon: Download, pages: [{ id: "Results", label: "Download", icon: Download }] },
  { label: "Settings", icon: Settings, pages: [{ id: "Settings", label: "Settings", icon: Settings }] },
];

/** The help topic the Help button opens on each tab. */
const TAB_HELP: Record<TabId, string> = {
  Overview: "overview",
  Editor: "design-editor",
  Units: "uploading-units",
  Links: "links",
  Coders: "coders-and-progress",
  Results: "results",
  Settings: "overview",
  Preview: "previewing-and-publishing",
};

const defaultQueryClient = new QueryClient();

export function AdminApp({
  client,
  location,
  onNavigate,
  useLeaveGuard = noGuard,
  queryClient,
  coderApiUrl,
  server,
  me,
}: {
  client: ResearcherApi;
  /** Accounts and the server admin's page (docs/accounts.md); without it, neither is shown. */
  server?: ServerApi;
  /** Who is logged in: their account role and limits. */
  me?: MeResponse | null;
  /** Where the researcher is, and going elsewhere (`replace`: without a history entry). */
  location: AdminLocation;
  onNavigate: (to: AdminLocation, options?: { replace?: boolean }) => void;
  useLeaveGuard?: LeaveGuard;
  queryClient?: QueryClient;
  /** Where coder sessions run (`<url>/d/...`), for previews; normally the client's own origin (""), since their cookies are same-origin. */
  coderApiUrl?: string;
}) {
  return (
    <QueryClientProvider client={queryClient ?? defaultQueryClient}>
      <AdminAppInner
        client={client}
        location={location}
        onNavigate={onNavigate}
        useLeaveGuard={useLeaveGuard}
        coderApiUrl={coderApiUrl}
        server={server}
        initialMe={me ?? null}
      />
      <HelpDialog />
    </QueryClientProvider>
  );
}

function AdminAppInner({
  client,
  location,
  onNavigate,
  useLeaveGuard,
  coderApiUrl,
  server,
  initialMe,
}: {
  client: ResearcherApi;
  location: AdminLocation;
  onNavigate: (to: AdminLocation, options?: { replace?: boolean }) => void;
  useLeaveGuard: LeaveGuard;
  coderApiUrl?: string;
  server?: ServerApi;
  initialMe: MeResponse | null;
}) {
  const selectedJobId = location.page === "job" ? location.jobId : null;
  const [me, setMe] = useState(initialMe);
  const serverPage = location.page === "server";
  // Unsaved codebook edits from an earlier session (localBackup.ts), read once
  const [backup, setBackup] = useState(() => readBackup());
  const [restore, setRestore] = useState<DesignBackup | null>(null);
  const banner = backup && (
    <BackupBanner
      client={client}
      backup={backup}
      onContinue={() => {
        onNavigate({ page: "job", jobId: backup.jobId, tab: "Editor" });
        setRestore(backup);
        setBackup(null);
      }}
      onDiscard={() => {
        if (!confirm("Throw away these unsaved codebook changes?")) return;
        clearBackup();
        setBackup(null);
      }}
    />
  );

  // If a job is selected, create a client scoped to that job
  const jobClient = useMemo(() => {
    if (selectedJobId === null) return null;
    return client.forJob(selectedJobId);
  }, [client, selectedJobId]);

  if (location.page !== "job" || !jobClient) {
    return (
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {banner}
        {serverPage && server ? (
          <ServerAdmin server={server} onBack={() => onNavigate({ page: "jobs" })} />
        ) : (
          <JobList
            client={client}
            onSelectJob={(id, open) => onNavigate({ page: "job", jobId: id, tab: open === "editor" ? "Editor" : "Overview" })}
            me={me}
            server={server}
            onMe={setMe}
            onOpenServerAdmin={() => onNavigate({ page: "server" })}
          />
        )}
      </div>
    );
  }

  return (
    <JobAdminView
      banner={banner}
      restore={restore && restore.jobId === selectedJobId ? restore : null}
      client={jobClient}
      rootClient={client}
      coderApiUrl={coderApiUrl}
      tab={location.tab}
      version={location.version}
      onTabChange={(tab) => onNavigate({ page: "job", jobId: location.jobId, tab })}
      onVersionChange={(version) => onNavigate({ page: "job", jobId: location.jobId, tab: "Editor", version }, { replace: true })}
      onBackToJobs={() => onNavigate({ page: "jobs" })}
      onSwitchJob={(id) => onNavigate({ page: "job", jobId: id, tab: location.tab === "Preview" ? "Overview" : location.tab })}
      useLeaveGuard={useLeaveGuard}
    />
  );
}

function JobAdminView({
  banner,
  restore,
  client,
  rootClient,
  coderApiUrl,
  tab,
  version,
  onTabChange,
  onVersionChange,
  onBackToJobs,
  onSwitchJob,
  useLeaveGuard,
}: {
  /** Offers unsaved codebook edits from an earlier session, if any. */
  banner: ReactNode;
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
  onBackToJobs: () => void;
  onSwitchJob: (jobId: number) => void;
  useLeaveGuard: LeaveGuard;
}) {
  const jobQuery = useJobQuery(client);
  const allJobsQuery = useJobsQuery(rootClient);
  const job = jobQuery.data;

  const [isDesignDirty, setIsDesignDirty] = useState(false);
  // Leaving the editor with unsaved edits (a tab, another job, the browser's back button): asked first
  const leave = useLeaveGuard(isDesignDirty && tab === "Editor");
  const saveDesign = useRef<SaveFn | null>(null);
  // A design version to open, from the overview; `n` remounts the manager on each request
  const [designTarget, setDesignTarget] = useState<{ id: number; n: number } | null>(null);
  const [savingDesign, setSavingDesign] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function saveAndNavigate() {
    setSavingDesign(true);
    setSaveError(null);
    try {
      await saveDesign.current?.();
      setIsDesignDirty(false);
      leave.proceed();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingDesign(false);
    }
  }

  // Navigation goes through the URL; the guard asks first when the editor has unsaved edits
  const requestNavigation = (action: () => void) => action();

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* The job's header: back, which job, its sections; hides while scrolling down (useCollapsingChrome) */}
      <CollapsibleHeader>
        <header className="border-b border-border bg-card/60 px-3 backdrop-blur-sm sm:px-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
            <div className="flex min-w-0 items-center gap-1">
              <IconButton icon={ChevronLeft} label="All jobs" onClick={() => requestNavigation(onBackToJobs)} />
              <select
                aria-label="Job"
                value={client.jobId}
                onChange={(e) => {
                  const newId = Number(e.target.value);
                  requestNavigation(() => onSwitchJob(newId));
                }}
                className="max-w-[16rem] truncate rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold text-foreground hover:border-input focus:border-input focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {allJobsQuery.data?.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </select>
              {job?.archived && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  <Archive className="h-3 w-3" /> Archived
                </span>
              )}
            </div>

            {/* The sections */}
            <nav className="flex gap-0.5 overflow-x-auto" aria-label="Job">
              {GROUPS.map((g) => {
                const Icon = g.icon;
                const active = g.pages.some((p) => p.id === tab);
                return (
                  <button
                    key={g.label}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => requestNavigation(() => onTabChange(g.pages[0].id))}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                      active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {g.label}
                  </button>
                );
              })}
            </nav>

            <div className="ml-auto flex items-center gap-1">
              <IconButton icon={CircleHelp} label="Help" onClick={() => openHelp(TAB_HELP[tab])} />
              <Button
                variant={tab === "Preview" ? "default" : "outline"}
                size="sm"
                onClick={() => requestNavigation(() => onTabChange("Preview"))}
                className="h-8 gap-1.5 text-xs"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                Preview
              </Button>
            </div>
          </div>
          {/* The active section's pages */}
          {(() => {
            const group = GROUPS.find((g) => g.pages.some((p) => p.id === tab));
            if (!group || group.pages.length < 2) return null;
            return (
              <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label={group.label}>
                {group.pages.map((p) => {
                  const Icon = p.icon;
                  const active = p.id === tab;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-current={active ? "page" : undefined}
                      onClick={() => requestNavigation(() => onTabChange(p.id))}
                      className={`flex items-center gap-1.5 border-b-2 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {p.label}
                    </button>
                  );
                })}
              </nav>
            );
          })()}
        </header>
      </CollapsibleHeader>

      {/* Main Tab Content */}
      {/* The editor fills the height, its panes scroll on their own; other pages scroll as a whole */}
      <main className={tab === "Editor" ? "flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-2 pb-3 sm:px-4" : "min-h-0 flex-1 overflow-auto p-4 sm:p-6"}>
        {banner}
        {/* The editor has its own Deploy */}
        {tab !== "Editor" && <PendingDeployBar client={client} />}
        {tab === "Overview" && (
          <JobOverview
            client={client}
            onNavigate={onTabChange}
            onOpenDesign={(id) => {
              setDesignTarget((t) => ({ id, n: (t?.n ?? 0) + 1 }));
              onTabChange("Editor");
            }}
          />
        )}
        {tab === "Settings" && <JobSettingsPage client={client} onDeleted={onBackToJobs} />}
        {tab === "Editor" && (
          <DesignManager
            key={`${designTarget?.n ?? 0}:${restore?.at ?? ""}`}
            initialVersionId={designTarget?.id ?? null}
            initialVersion={version}
            onVersionChange={onVersionChange}
            restore={restore}
            client={client}
            onDirtyChange={setIsDesignDirty}
            registerSave={(save) => {
              saveDesign.current = save;
            }}
          />
        )}
        {tab === "Units" && <UnitsPage client={client} />}
        {tab === "Links" && <LinksPanel client={client} />}
        {tab === "Coders" && <CodersPanel client={client} />}
        {tab === "Results" && <ResultsPanel client={client} />}
        {tab === "Preview" && <JobPreview client={client} coderApiUrl={coderApiUrl} />}
      </main>

      {/* Unsaved Changes Confirmation Modal */}
      <UnsavedChangesDialog
        open={leave.blocked}
        isSaving={savingDesign}
        error={saveError}
        onCancel={() => {
          leave.stay();
          setSaveError(null);
        }}
        onDiscard={() => {
          clearBackup();
          setIsDesignDirty(false);
          setSaveError(null);
          leave.proceed();
        }}
        onSave={saveAndNavigate}
      />
    </div>
  );
}

/** Offers unsaved codebook edits from an earlier session (the browser was closed): continue with them, or throw them away. */
function BackupBanner({
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
  const jobs = useJobsQuery(client);
  const job = jobs.data?.find((j) => j.id === backup.jobId);
  const when = new Date(backup.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500 bg-amber-500/10 px-4 py-3 text-sm">
      <div className="flex items-start gap-2.5">
        <FilePen className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <p className="font-semibold text-foreground">You have unsaved changes in the codebook editor</p>
          <p className="text-muted-foreground">
            In {job ? `"${job.name}"` : `job #${backup.jobId}`}, from {when}. They were kept in this browser.
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
