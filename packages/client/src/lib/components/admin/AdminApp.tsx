import { useState, useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MeResponse } from "@annotinder/contracts";
import type { ServerApi } from "../../api/serverApi";
import { ServerAdmin } from "./server/ServerAdmin";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import { StudyList } from "./StudyList";
import { clearBackup, readBackup, type DesignBackup } from "../../design/localBackup";
import { HelpDialog } from "../../help/HelpDialog";
import type { TabId } from "../../admin/tabs";
import { BackupBanner } from "./BackupBanner";
import { StudyAdminView } from "./study/StudyAdminView";
import type { AskFirst } from "./study/useSaveBeforeLeaving";

/**
 * Where the researcher is (the app's URL, router.tsx): the studies, the server
 * admin's page, or a study's page (the editor on a version: its number, v1, v2, ...).
 */
export type AdminLocation =
  { page: "studies" } | { page: "server" } | { page: "study"; studyId: number; tab: TabId; version?: number };

/**
 * Asks before leaving a page with unsaved edits (when `when`), e.g. the
 * router's blocker: `blocked` while it waits for an answer, then `proceed`
 * or `stay`. Without one (tests), nothing is asked.
 */
export type LeaveGuard = (when: boolean) => { blocked: boolean; proceed: () => void; stay: () => void };
const noGuard: LeaveGuard = () => ({ blocked: false, proceed: () => {}, stay: () => {} });

const defaultQueryClient = new QueryClient();

/** The researcher UI (docs/client.md §7): the study list, a study's pages, and the server admin's page. */
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
  const selectedStudyId = location.page === "study" ? location.studyId : null;
  const [me, setMe] = useState(initialMe);
  const serverPage = location.page === "server";
  // Unsaved design edits from an earlier session (localBackup.ts), read once
  const [backup, setBackup] = useState(() => readBackup());
  const [restore, setRestore] = useState<DesignBackup | null>(null);
  // `askFirst`: continuing opens the editor anew, so unsaved edits in the open editor are asked about first
  const banner = (askFirst: AskFirst) =>
    backup && (
      <BackupBanner
        client={client}
        backup={backup}
        onContinue={() =>
          askFirst(() => {
            onNavigate({ page: "study", studyId: backup.studyId, tab: "Design" });
            setRestore(backup);
            setBackup(null);
          })
        }
        onDiscard={() => {
          if (!confirm("Throw away these unsaved design changes?")) return;
          clearBackup(backup.studyId);
          setBackup(null);
        }}
      />
    );

  // If a study is selected, create a client scoped to that study
  const studyClient = useMemo(() => {
    if (selectedStudyId === null) return null;
    return client.forStudy(selectedStudyId);
  }, [client, selectedStudyId]);

  if (location.page !== "study" || !studyClient) {
    return (
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {banner((action) => action())}
        {serverPage && server ? (
          <ServerAdmin server={server} onBack={() => onNavigate({ page: "studies" })} />
        ) : (
          <StudyList
            client={client}
            onSelectStudy={(id, open) =>
              onNavigate({ page: "study", studyId: id, tab: open === "design" ? "Design" : "Overview" })
            }
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
    <StudyAdminView
      banner={banner}
      restore={restore && restore.studyId === selectedStudyId ? restore : null}
      client={studyClient}
      rootClient={client}
      coderApiUrl={coderApiUrl}
      tab={location.tab}
      version={location.version}
      onTabChange={(tab) => onNavigate({ page: "study", studyId: location.studyId, tab })}
      onVersionChange={(version) =>
        onNavigate({ page: "study", studyId: location.studyId, tab: "Design", version }, { replace: true })
      }
      onBackToStudies={() => onNavigate({ page: "studies" })}
      onSwitchStudy={(id) =>
        onNavigate({ page: "study", studyId: id, tab: location.tab === "Preview" ? "Overview" : location.tab })
      }
      useLeaveGuard={useLeaveGuard}
    />
  );
}
