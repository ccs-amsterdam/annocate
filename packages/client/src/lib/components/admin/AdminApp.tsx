import { useState, useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AdminClient } from "../../api/httpAdminClient";
import { useJobQuery, useJobsQuery } from "../../admin/queries";
import { JobList } from "./JobList";
import { JobSettings } from "./JobSettings";
import { CodebookManager } from "./CodebookManager";
import { UnitsManager } from "./UnitsManager";
import { UnitsetsManager } from "./UnitsetsManager";
import { CodersPanel } from "./CodersPanel";
import { JobPreview } from "./JobPreview";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Sliders, BookOpen, Layers, Users, Play, Archive } from "lucide-react";

const TABS = [
  { id: "Settings", label: "Settings", icon: Sliders },
  { id: "Codebook", label: "Codebook", icon: BookOpen },
  { id: "Units", label: "Units", icon: Layers },
  { id: "Unitsets", label: "Unitsets", icon: Layers },
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
}: {
  client: AdminClient;
  /** The job server's base URL, used to build invite links in Coders & Preview. */
  baseUrl: string;
  initialJobId?: number;
  queryClient?: QueryClient;
}) {
  return (
    <QueryClientProvider client={queryClient ?? defaultQueryClient}>
      <AdminAppInner client={client} baseUrl={baseUrl} initialJobId={initialJobId} />
    </QueryClientProvider>
  );
}

function AdminAppInner({
  client,
  baseUrl,
  initialJobId,
}: {
  client: AdminClient;
  baseUrl: string;
  initialJobId?: number;
}) {
  const [selectedJobId, setSelectedJobId] = useState<number | null>(initialJobId ?? null);
  const [tab, setTab] = useState<TabId>("Codebook");

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
  tab,
  onTabChange,
  onBackToJobs,
  onSwitchJob,
}: {
  client: AdminClient;
  rootClient: AdminClient;
  baseUrl: string;
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
        {tab === "Settings" && <JobSettings client={client} onDeleted={onBackToJobs} />}
        {tab === "Codebook" && <CodebookManager client={client} onDirtyChange={setIsCodebookDirty} />}
        {tab === "Units" && <UnitsManager client={client} />}
        {tab === "Unitsets" && <UnitsetsManager client={client} />}
        {tab === "Coders" && <CodersPanel client={client} baseUrl={baseUrl} />}
        {tab === "Preview" && <JobPreview client={client} baseUrl={baseUrl} />}
      </main>

      {/* Unsaved Changes Confirmation Modal */}
      <UnsavedChangesDialog
        open={pendingNav !== null}
        onCancel={() => setPendingNav(null)}
        onDiscard={() => {
          setIsCodebookDirty(false);
          const nav = pendingNav;
          setPendingNav(null);
          nav?.();
        }}
        onSave={() => {
          // Keep current modal state, user can save in CodebookEditor
          setPendingNav(null);
        }}
      />
    </div>
  );
}
