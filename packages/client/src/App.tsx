import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthOptions, MeResponse } from "@annotinder/contracts";
import { JobRunner } from "./lib/components/JobRunner";
import { AdminApp } from "./lib/components/admin/AdminApp";
import { ResearcherGate } from "./lib/components/admin/account/ResearcherGate";
import { AccountMenu } from "./lib/components/admin/account/AccountMenu";
import { HttpResearcherApi } from "./lib/api/httpResearcherApi";
import { ServerApi } from "./lib/api/serverApi";
import { LayoutDashboard, PenTool } from "lucide-react";
import { useTheme } from "./lib/context/theme";

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

/**
 * Who is using the researcher UI: a logged-in researcher (session cookie),
 * the development user (a server without login but with development auth),
 * or nobody yet (`me` null).
 */
function useResearcher() {
  const [state, setState] = useState<{ options: AuthOptions; me: MeResponse | null } | null>(null);
  useEffect(() => {
    void (async () => {
      const options = await sessionApi.getAuthOptions().catch(() => ({ login: false, devAuth: false }));
      const api = !options.login && options.devAuth ? devApi : sessionApi;
      const me = await api.getMe().catch(() => null);
      setState({ options, me });
    })();
  }, []);
  const dev = state !== null && !state.options.login && state.options.devAuth;
  return { state, dev, api: dev ? devApi : sessionApi };
}

/** The researcher UI: behind a login if the server has one, else with development headers. */
function ResearcherView({ dev, me }: { dev: boolean; me: MeResponse | null }) {
  const admin = (api: HttpResearcherApi, who: MeResponse | null) => (
    <AdminApp
      client={api}
      baseUrl={SERVER_URL}
      inviteUrl={devInviteUrl}
      coderApiUrl={CODER_API_URL}
      server={new ServerApi(api)}
      me={who}
    />
  );
  if (dev) return admin(devApi, me);
  return <ResearcherGate client={sessionApi}>{(who) => admin(sessionApi, who)}</ResearcherGate>;
}

function App() {
  // Coder links (docs/coder-identity.md): ?deployment=1&invite=...&<parameters the invite requires>
  // or ?deployment=...&transfer=... from "Continue on another device".
  const [params, setParams] = useState(() => new URLSearchParams(window.location.search));
  const inviteSecret = params.get("invite") ?? "demo-secret";
  const deploymentId = params.get("deployment") ?? "1";
  const transferToken = params.get("transfer") ?? undefined;
  // Everything else in the URL goes to the server: the participant id and other parameters the invite requires, and `url_param` auto variables.
  const urlParams = useMemo(() => {
    const rest = Object.fromEntries(params);
    for (const own of ["invite", "deployment", "transfer", "view"]) delete rest[own];
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
  const researcher = useResearcher();
  // The researcher UI follows the theme too (the coder UI applies it itself).
  useTheme();

  return (
    <div className="flex h-screen flex-col overflow-clip bg-background text-foreground">
      {/* Dev Shell Navbar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 shadow-sm">
        <div className="flex flex-1 items-center gap-3">
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

        <div className="flex flex-1 justify-end">
          {researcher.state && (
            <AccountMenu
              client={researcher.api}
              me={researcher.state.me}
              dev={researcher.dev}
              canLogIn={researcher.state.options.login}
            />
          )}
        </div>
      </header>

      {/* Main Viewport */}
      <div className="flex-1 overflow-hidden">
        {view === "admin" ? (
          researcher.state && <ResearcherView dev={researcher.dev} me={researcher.state.me} />
        ) : (
          <JobRunner
            baseUrl={`${CODER_API_URL}/d/${deploymentId}`}
            inviteSecret={inviteSecret}
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
