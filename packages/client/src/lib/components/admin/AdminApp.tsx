import { useState, useMemo, useRef, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CoderInviteResponse, MeResponse } from "@annotinder/contracts";
import type { ServerApi } from "../../api/serverApi";
import { ServerAdmin } from "./server/ServerAdmin";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import { useJobQuery, useJobsQuery } from "../../admin/queries";
import { JobList } from "./JobList";
import { CodebookManager } from "./CodebookManager";
import type { SaveFn } from "./CodebookEditor";
import { UnitsPage } from "./units/UnitsPage";
import { CodersPanel } from "./CodersPanel";
import { ResultsPanel } from "./ResultsPanel";
import { InvitationsPanel } from "./InvitationsPanel";
import { JobOverview, JobSettingsPage } from "./overview/JobOverview";
import { JobPreview } from "./JobPreview";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import { Button } from "@/components/ui/button";
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
import { clearBackup, readBackup, type CodebookBackup } from "../../codebook/localBackup";
import { HelpDialog } from "../../help/HelpDialog";
import { openHelp } from "../../help/helpStore";

/** The job's pages. Preview is opened with the Preview Job button, not from the tabs. */
type TabId = "Overview" | "Codebook" | "Units" | "Invitations" | "Coders" | "Results" | "Settings" | "Preview";

/**
 * The tabs, grouped: designing the job (codebook, units), deploying it
 * (invitations, coders), its results, and settings. A group with more than
 * one page shows them as sub tabs.
 */
const GROUPS: { label: string; icon: typeof LayoutDashboard; pages: { id: TabId; label: string; icon: typeof LayoutDashboard }[] }[] = [
  { label: "Overview", icon: LayoutDashboard, pages: [{ id: "Overview", label: "Overview", icon: LayoutDashboard }] },
  {
    label: "Design",
    icon: PencilRuler,
    pages: [
      { id: "Codebook", label: "Codebook", icon: BookOpen },
      { id: "Units", label: "Units", icon: Layers },
    ],
  },
  {
    label: "Deploy",
    icon: Send,
    pages: [
      { id: "Invitations", label: "Invitations", icon: Link2 },
      { id: "Coders", label: "Coders", icon: Users },
    ],
  },
  { label: "Results", icon: Download, pages: [{ id: "Results", label: "Download", icon: Download }] },
  { label: "Settings", icon: Settings, pages: [{ id: "Settings", label: "Settings", icon: Settings }] },
];

/** The help topic the Help button opens on each tab. */
const TAB_HELP: Record<TabId, string> = {
  Overview: "overview",
  Codebook: "codebook-editor",
  Units: "uploading-units",
  Invitations: "invitations",
  Coders: "coders-and-progress",
  Results: "results",
  Settings: "overview",
  Preview: "previewing-and-publishing",
};

const defaultQueryClient = new QueryClient();

export function AdminApp({
  client,
  baseUrl,
  initialJobId,
  queryClient,
  inviteUrl,
  coderApiUrl,
  server,
  me,
}: {
  client: ResearcherApi;
  /** The researcher API's base URL. */
  baseUrl: string;
  /** Accounts and the server admin's page (docs/accounts.md); without it, neither is shown. */
  server?: ServerApi;
  /** Who is logged in: their account role and limits. */
  me?: MeResponse | null;
  initialJobId?: number;
  queryClient?: QueryClient;
  /** Builds the link coders open for an invite (host-app specific). */
  inviteUrl?: (invite: CoderInviteResponse) => string;
  /** Where coder sessions run (`<url>/d/...`), for previews; normally the client's own origin (""), since their cookies are same-origin. */
  coderApiUrl?: string;
}) {
  return (
    <QueryClientProvider client={queryClient ?? defaultQueryClient}>
      <AdminAppInner
        client={client}
        baseUrl={baseUrl}
        initialJobId={initialJobId}
        inviteUrl={inviteUrl}
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
  baseUrl,
  initialJobId,
  inviteUrl,
  coderApiUrl,
  server,
  initialMe,
}: {
  client: ResearcherApi;
  baseUrl: string;
  initialJobId?: number;
  inviteUrl?: (invite: CoderInviteResponse) => string;
  coderApiUrl?: string;
  server?: ServerApi;
  initialMe: MeResponse | null;
}) {
  const [selectedJobId, setSelectedJobId] = useState<number | null>(initialJobId ?? null);
  const [me, setMe] = useState(initialMe);
  const [serverPage, setServerPage] = useState(false);
  const [tab, setTab] = useState<TabId>("Overview");
  // Unsaved codebook edits from an earlier session (localBackup.ts), read once
  const [backup, setBackup] = useState(() => readBackup());
  const [restore, setRestore] = useState<CodebookBackup | null>(null);
  const banner = backup && (
    <BackupBanner
      client={client}
      backup={backup}
      onContinue={() => {
        setSelectedJobId(backup.jobId);
        setTab("Codebook");
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

  if (selectedJobId === null || !jobClient) {
    return (
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {banner}
        {serverPage && server ? (
          <ServerAdmin server={server} onBack={() => setServerPage(false)} />
        ) : (
          <JobList
            client={client}
            onSelectJob={(id, open) => {
              setSelectedJobId(id);
              if (open === "codebook") setTab("Codebook");
            }}
            me={me}
            server={server}
            onMe={setMe}
            onOpenServerAdmin={() => setServerPage(true)}
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
      baseUrl={baseUrl}
      inviteUrl={inviteUrl}
      coderApiUrl={coderApiUrl}
      tab={tab}
      onTabChange={setTab}
      onBackToJobs={() => setSelectedJobId(null)}
      onSwitchJob={(id) => setSelectedJobId(id)}
    />
  );
}

function JobAdminView({
  banner,
  restore,
  client,
  rootClient,
  baseUrl,
  inviteUrl,
  coderApiUrl,
  tab,
  onTabChange,
  onBackToJobs,
  onSwitchJob,
}: {
  /** Offers unsaved codebook edits from an earlier session, if any. */
  banner: ReactNode;
  /** Those edits, once the researcher chose to continue with them. */
  restore: CodebookBackup | null;
  client: ResearcherApi;
  rootClient: ResearcherApi;
  baseUrl: string;
  inviteUrl?: (invite: CoderInviteResponse) => string;
  coderApiUrl?: string;
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
            <Button variant="ghost" size="sm" onClick={() => openHelp(TAB_HELP[tab])} className="gap-1.5 text-xs text-muted-foreground">
              <CircleHelp className="h-3.5 w-3.5" />
              Help
            </Button>
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

        {/* Tab Navigation: the groups, and the active group's pages */}
        <nav className="mt-3 flex gap-1 overflow-x-auto border-t border-border/40 pt-2" aria-label="Job">
          {GROUPS.map((g) => {
            const Icon = g.icon;
            const active = g.pages.some((p) => p.id === tab);
            return (
              <button
                key={g.label}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => requestNavigation(() => onTabChange(g.pages[0].id))}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {g.label}
              </button>
            );
          })}
        </nav>
        {(() => {
          const group = GROUPS.find((g) => g.pages.some((p) => p.id === tab));
          if (!group || group.pages.length < 2) return null;
          return (
            <nav className="mt-2 flex gap-1 overflow-x-auto" aria-label={group.label}>
              {group.pages.map((p) => {
                const Icon = p.icon;
                const active = p.id === tab;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => requestNavigation(() => onTabChange(p.id))}
                    className={`flex items-center gap-1.5 border-b-2 px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
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

      {/* Main Tab Content */}
      <main className="flex-1 overflow-auto p-4 sm:p-6">
        {banner}
        {tab === "Overview" && (
          <JobOverview
            client={client}
            onNavigate={onTabChange}
            onOpenCodebook={(id) => {
              setCodebookTarget((t) => ({ id, n: (t?.n ?? 0) + 1 }));
              onTabChange("Codebook");
            }}
          />
        )}
        {tab === "Settings" && <JobSettingsPage client={client} onDeleted={onBackToJobs} />}
        {tab === "Codebook" && (
          <CodebookManager
            key={`${codebookTarget?.n ?? 0}:${restore?.at ?? ""}`}
            initialVersionId={codebookTarget?.id ?? null}
            restore={restore}
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
        {tab === "Results" && <ResultsPanel client={client} />}
        {tab === "Preview" && <JobPreview client={client} coderApiUrl={coderApiUrl} />}
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
          clearBackup();
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

/** Offers unsaved codebook edits from an earlier session (the browser was closed): continue with them, or throw them away. */
function BackupBanner({
  client,
  backup,
  onContinue,
  onDiscard,
}: {
  client: ResearcherApi;
  backup: CodebookBackup;
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
          <p className="font-semibold text-foreground">You have unsaved codebook changes</p>
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
