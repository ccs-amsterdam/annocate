import { useCallback, useMemo, useState } from "react";
import { JobRunner } from "./lib/components/JobRunner";
import { AdminApp } from "./lib/components/admin/AdminApp";
import { HttpAdminClient } from "./lib/api/httpAdminClient";
import { LayoutDashboard, PenTool } from "lucide-react";

// Standalone dev-app shell: runs the annotinder-client against a local
// reference db server + job server, using a device-stored coder key per invite
// (the seed demo job's invite secret by default). Real deployments should
// import { JobRunner } / { AdminApp } (or their building blocks) into a host
// app instead -- see docs/client.md §1
const DB_SERVER_URL = import.meta.env.VITE_DB_SERVER_URL ?? "http://localhost:8787";
// Coders talk to the job server, not the db server (docs/architecture.md),
// on the client's own origin: its session cookie is same-origin only. In dev,
// Vite proxies `/d` to the job server (vite.config.ts). The seed demo job is
// deployed as `<db server host>/1`, e.g. `localhost:8787/1`.
const JOB_SERVER_URL = import.meta.env.VITE_JOB_SERVER_URL ?? "";

const adminClient = new HttpAdminClient({
  baseUrl: DB_SERVER_URL,
  devRole: "ADMIN",
  devEmail: "dev@example.com",
});

type View = "admin" | "annotate";

/** Invite links for this dev shell: the reference db server is the job server's `mock` backend. */
function devInviteUrl(invite: { jobId: number; secret: string }): string {
  return `${window.location.origin}${window.location.pathname}?deployment=mock.${invite.jobId}&invite=${invite.secret}`;
}

function App() {
  // Coder links (docs/coder-identity.md): ?deployment=localhost:8787/1&invite=...&participant=...
  // or ?deployment=...&transfer=... from "Continue on another device".
  const [params, setParams] = useState(() => new URLSearchParams(window.location.search));
  const inviteSecret = params.get("invite") ?? "demo-secret";
  const deploymentId = params.get("deployment") ?? `${new URL(DB_SERVER_URL).host}/1`;
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
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Dev Shell Navbar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
              A
            </span>
            <span className="font-heading text-lg font-bold tracking-tight text-foreground">
              Annotinder
            </span>
          </div>
          <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
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
          <AdminApp client={adminClient} baseUrl={DB_SERVER_URL} inviteUrl={devInviteUrl} jobServerUrl={JOB_SERVER_URL} />
        ) : (
          <JobRunner
            baseUrl={`${JOB_SERVER_URL}/d/${deploymentId}`}
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
