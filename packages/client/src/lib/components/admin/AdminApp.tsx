import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AdminClient } from "../../api/httpAdminClient";
import { useJobQuery } from "../../admin/queries";
import { JobSettings } from "./JobSettings";
import { CodebookManager } from "./CodebookManager";
import { UnitsManager } from "./UnitsManager";
import { UnitsetsManager } from "./UnitsetsManager";
import { CodersPanel } from "./CodersPanel";

const TABS = ["Job", "Codebooks", "Units", "Unitsets", "Coders"] as const;
type Tab = (typeof TABS)[number];

// Own, isolated QueryClient by default -- AdminApp is meant to be dropped
// into a host app's React tree as a self-contained widget (design plan §7),
// so it shouldn't require the host to already have TanStack Query set up.
// If the host already uses TanStack Query, nesting providers is harmless
// (the inner one simply shadows the outer one for this subtree).
const defaultQueryClient = new QueryClient();

/**
 * Top-level job management UI (design plan §5): job settings, codebook
 * editor/list, units upload, unitsets, and coders/progress -- a tabbed shell
 * over the individual panels. Deliberately NOT URL-routed (no router
 * dependency) so it stays embeddable in any host app's own component tree.
 */
export function AdminApp({
  client,
  baseUrl,
  queryClient,
}: {
  client: AdminClient;
  /** The job server's base URL, used to build invite links in the Coders tab. */
  baseUrl: string;
  queryClient?: QueryClient;
}) {
  return (
    <QueryClientProvider client={queryClient ?? defaultQueryClient}>
      <AdminAppInner client={client} baseUrl={baseUrl} />
    </QueryClientProvider>
  );
}

function AdminAppInner({ client, baseUrl }: { client: AdminClient; baseUrl: string }) {
  const [tab, setTab] = useState<Tab>("Job");
  const jobQuery = useJobQuery(client);
  const hasJob = !!jobQuery.data;

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <nav className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            disabled={t !== "Job" && !hasJob}
            onClick={() => setTab(t)}
            className={`rounded-t px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
              tab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-auto">
        {tab === "Job" && <JobSettings client={client} />}
        {tab === "Codebooks" && hasJob && <CodebookManager client={client} />}
        {tab === "Units" && hasJob && <UnitsManager client={client} />}
        {tab === "Unitsets" && hasJob && <UnitsetsManager client={client} />}
        {tab === "Coders" && hasJob && <CodersPanel client={client} baseUrl={baseUrl} />}
      </div>
    </div>
  );
}
