import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ServerApi } from "../../../api/serverApi";
import { HelpButton } from "../../../help/HelpButton";
import { UsersTab } from "./UsersTab";
import { RequestsTab } from "./RequestsTab";
import { PlansTab, RegistrationTab } from "./PlansTab";
import { StudiesTab, LogTab } from "./StudiesTab";

const TABS = ["Users", "Requests", "Plans", "Registration", "Studies", "Log"] as const;
type Tab = (typeof TABS)[number];

/**
 * The server admin's page (docs/accounts.md): users and their roles and
 * limits (invited by email until their first login), requests to become a
 * researcher, plans, registration and size settings, studies (suspend,
 * owner) and the log of admin actions. Admins don't see study data here.
 * Each of its pages is in its own file.
 */
export function ServerAdmin({ server, onBack }: { server: ServerApi; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>("Users");
  const requests = useQuery({ queryKey: ["admin", "server", "requests"], queryFn: () => server.listRequests() });
  const warnings = useQuery({ queryKey: ["admin", "server", "warnings"], queryFn: () => server.getWarnings() });
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" /> All studies
        </Button>
        <h1 className="flex items-center gap-1.5 text-2xl font-bold tracking-tight">
          Server admin <HelpButton topic="server-admin" label="Help: server admin" />
        </h1>
      </div>
      {/* Hardening warnings (docs/security.md): what makes this server less secure */}
      {(warnings.data ?? []).map((w) => (
        <div
          key={w.code}
          role="alert"
          className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>{w.message}</span>
        </div>
      ))}
      <div className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`cursor-pointer border-b-2 px-3 py-2 text-sm ${tab === t ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t}
            {t === "Requests" && (requests.data?.length ?? 0) > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white">
                {requests.data!.length}
              </span>
            )}
          </button>
        ))}
      </div>
      {tab === "Users" && (
        <UsersTab server={server} migrating={(warnings.data ?? []).some((w) => w.code === "migration_not_finished")} />
      )}
      {tab === "Requests" && <RequestsTab server={server} />}
      {tab === "Plans" && <PlansTab server={server} />}
      {tab === "Registration" && <RegistrationTab server={server} />}
      {tab === "Studies" && <StudiesTab server={server} />}
      {tab === "Log" && <LogTab server={server} />}
    </div>
  );
}
