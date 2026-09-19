import { useState } from "react";
import { JobRunner } from "./lib/components/JobRunner";
import { AdminApp } from "./lib/components/admin/AdminApp";
import { HttpAdminClient } from "./lib/api/httpAdminClient";
import { LayoutDashboard, PenTool } from "lucide-react";

// Standalone dev-app shell: runs the annotinder-client against a local
// mock-server (see packages/mock-server), using a per-browser persisted
// coder key + the seed demo job's invite secret. Real deployments should
// import { JobRunner } / { AdminApp } (or their building blocks) into a host
// app instead -- see design plan §7.
const MOCK_SERVER_URL = import.meta.env.VITE_MOCK_SERVER_URL ?? "http://localhost:8787";

function getOrCreateCoderKey(): string {
  const storageKey = "annotinder-client:dev-coder-key";
  let key = localStorage.getItem(storageKey);
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem(storageKey, key);
  }
  return key;
}

const adminClient = new HttpAdminClient({
  baseUrl: MOCK_SERVER_URL,
  devRole: "ADMIN",
  devEmail: "dev@example.com",
});

type View = "admin" | "annotate";

function App() {
  const coderKey = getOrCreateCoderKey();
  const inviteSecret = new URLSearchParams(window.location.search).get("invite") ?? "demo-secret";
  const [view, setView] = useState<View>("admin");

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
          <AdminApp client={adminClient} baseUrl={MOCK_SERVER_URL} />
        ) : (
          <JobRunner baseUrl={MOCK_SERVER_URL} coderKey={coderKey} inviteSecret={inviteSecret} />
        )}
      </div>
    </div>
  );
}

export default App;
