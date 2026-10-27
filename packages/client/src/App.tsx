import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthOptions } from "@annotinder/contracts";
import { JobRunner } from "./lib/components/JobRunner";
import { AdminApp } from "./lib/components/admin/AdminApp";
import { ResearcherGate } from "./lib/components/admin/account/ResearcherGate";
import { AccountMenu } from "./lib/components/admin/account/AccountMenu";
import { HttpResearcherApi } from "./lib/api/httpResearcherApi";
import { LayoutDashboard, PenTool } from "lucide-react";

// Standalone dev-app shell: runs the annotinder-client against a local
// server (the seed demo job's invite secret by default). Real deployments
// should import { JobRunner } / { AdminApp } (or their building blocks) into
// a host app instead -- see docs/client.md §1
//
// The server is on the client's own origin (session cookies are same-origin
// only): in dev, Vite proxies the API paths to it (vite.config.ts).
const SERVER_URL = "";
const CODER_API_URL = "";

/** Logged-in researchers: the session cookie. */
const sessionApi = new HttpResearcherApi({ baseUrl: SERVER_URL });
/** A server without login but with development auth (`pnpm dev` without OIDC settings). */
const devApi = new HttpResearcherApi({ baseUrl: SERVER_URL, devRole: "ADMIN", devEmail: "dev@example.com" });

type View = "admin" | "annotate";

/** Invite links for this dev shell. */
function devInviteUrl(invite: { jobId: number; secret: string }): string {
  return `${window.location.origin}${window.location.pathname}?deployment=${invite.jobId}&invite=${invite.secret}`;
}

/** The researcher UI: behind a login if the server has one, else with development headers. */
function ResearcherView() {
  const [options, setOptions] = useState<AuthOptions | null>(null);
  useEffect(() => {
    sessionApi.getAuthOptions().then(setOptions, () => setOptions({ login: false, devAuth: false }));
  }, []);
  if (!options) return null;

  const admin = (api: HttpResearcherApi) => (
    <AdminApp client={api} baseUrl={SERVER_URL} inviteUrl={devInviteUrl} coderApiUrl={CODER_API_URL} />
  );
  if (!options.login && options.devAuth) return admin(devApi);
  return (
    <ResearcherGate client={sessionApi}>
      {(me) => (
        <div className="flex h-full flex-col">
          <div className="flex justify-end border-b border-border px-4 py-1">
            <AccountMenu client={sessionApi} me={me} />
          </div>
          <div className="flex-1 overflow-auto">{admin(sessionApi)}</div>
        </div>
      )}
    </ResearcherGate>
  );
}

function App() {
  // Coder links (docs/coder-identity.md): ?deployment=1&invite=...&participant=...
  // or ?deployment=...&transfer=... from "Continue on another device".
  const [params, setParams] = useState(() => new URLSearchParams(window.location.search));
  const inviteSecret = params.get("invite") ?? "demo-secret";
  const deploymentId = params.get("deployment") ?? "1";
  const participantId = params.get("participant") ?? undefined;
  const transferToken = params.get("transfer") ?? undefined;
  // Everything else in the URL may feed the codebook's `url_param` auto variables.
  const urlParams = useMemo(() => {
    const rest = Object.fromEntries(params);
    for (const own of ["invite", "deployment", "participant", "transfer", "view"]) delete rest[own];
    return rest;
  }, [params]);
  const clearTransfer = useCallback(() => {
    const next = new URLSearchParams(window.location.search);
    next.delete("transfer");
    const query = next.toString();
    window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : ""));
    setParams(next);
  }, []);
  const [view, setView] = useState<View>(params.has("invite") || params.has("transfer") ? "annotate" : "admin");

  return (
    <div className="flex h-screen flex-col overflow-clip bg-background text-foreground">
      {/* Dev Shell Navbar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
              A
            </span>
            <span className="hidden font-heading text-lg font-bold tracking-tight text-foreground sm:inline">
              Annotinder
            </span>
          </div>
          <span className="hidden rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground sm:inline">
            dev mode
          </span>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
          <button
            type="button"
            onClick={() => setView("admin")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              view === "admin"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            Manage jobs
          </button>
          <button
            type="button"
            onClick={() => setView("annotate")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              view === "annotate"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <PenTool className="h-3.5 w-3.5" />
            Annotate
          </button>
        </div>
      </header>

      {/* Main Viewport */}
      <div className="flex-1 overflow-hidden">
        {view === "admin" ? (
          <ResearcherView />
        ) : (
          <JobRunner
            baseUrl={`${CODER_API_URL}/d/${deploymentId}`}
            inviteSecret={inviteSecret}
            participantId={participantId}
            urlParams={urlParams}
            transferToken={transferToken}
            onTransferRedeemed={clearTransfer}
          />
        )}
      </div>
    </div>
  );
}

export default App;
