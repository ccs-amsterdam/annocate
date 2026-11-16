import { useState } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import type { StudyUser, StudyUserResponse, Role } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/info-tip";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useStudyUsersMutation, useStudyUsersQuery } from "../../../admin/queries";

const ROLES: { value: Role; label: string; help: string }[] = [
  { value: "READ", label: "Read", help: "sees the study and downloads the results" },
  { value: "WRITE", label: "Write", help: "also edits the design, units and links" },
  { value: "ADMIN", label: "Admin", help: "also manages access, resets and deletes data" },
];

/**
 * Who has access to the study, and with which role (docs/client.md §7): only
 * admins of the study see and change it. The list is saved as a whole; it
 * always keeps an admin.
 */
export function TeamSettings({ client }: { client: ResearcherApi }) {
  const usersQuery = useStudyUsersQuery(client);
  const save = useStudyUsersMutation(client);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("WRITE");

  if (usersQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (usersQuery.isError)
    return (
      <p className="text-sm text-muted-foreground">Only admins of this study can see and change who has access.</p>
    );
  const users = usersQuery.data ?? [];
  const admins = users.filter((u) => u.role === "ADMIN").length;
  // The list as written: who, with which role (and which disabled role to turn on again)
  const toWrite = (list: StudyUserResponse[], restore?: string): StudyUser[] =>
    list.map((u) => ({ email: u.email, role: u.role, ...(u.email === restore ? { restore: true as const } : {}) }));
  const update = (next: StudyUserResponse[], restore?: string) => save.mutate(toWrite(next, restore));

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <ul className="flex flex-col divide-y rounded-lg border">
        {users.map((u) => {
          const lastAdmin = u.role === "ADMIN" && admins === 1;
          return (
            <li key={u.email} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {u.email}
                {u.pending && !u.disabled && (
                  <span
                    className="ml-1.5 text-xs text-muted-foreground"
                    title="Not logged in yet: their first login with this email address gives them access"
                  >
                    invited
                  </span>
                )}
                {u.disabled && (
                  <span
                    className="ml-1.5 text-xs text-amber-700"
                    title={
                      u.pending
                        ? "Invited more than 3 months ago and never logged in: the invitation expired"
                        : "Back after a year away without a second factor: their role here was turned off"
                    }
                  >
                    {u.pending ? "invitation expired" : "role turned off"}
                  </span>
                )}
              </span>
              {u.disabled && (
                <Button
                  variant="outline"
                  size="xs"
                  disabled={save.isPending}
                  onClick={() => {
                    if (confirm(`Turn ${u.email}'s role on again? Only if you're sure this address is still theirs.`))
                      update(users, u.email);
                  }}
                >
                  <RotateCcw className="h-3 w-3" /> Restore
                </Button>
              )}
              <select
                aria-label={`Role of ${u.email}`}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={u.role}
                disabled={save.isPending || lastAdmin}
                title={lastAdmin ? "A study needs at least one admin" : undefined}
                onChange={(e) =>
                  update(users.map((x) => (x.email === u.email ? { ...x, role: e.target.value as Role } : x)))
                }
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${u.email}`}
                disabled={save.isPending || lastAdmin}
                onClick={() => {
                  if (confirm(`Remove ${u.email}'s access to this study?`))
                    update(users.filter((x) => x.email !== u.email));
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          );
        })}
      </ul>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const address = email.trim().toLowerCase();
          if (!address) return;
          const rest = users.filter((u) => u.email.toLowerCase() !== address);
          save.mutate([...toWrite(rest), { email: address, role }], { onSuccess: () => setEmail("") });
        }}
      >
        <Input
          type="email"
          className="h-8 w-64 text-sm"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline" disabled={save.isPending || !email.trim()}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
        <InfoTip label="About roles">
          <ul>
            {ROLES.map((r) => (
              <li key={r.value}>
                <strong className="font-medium text-foreground">{r.label}</strong>: {r.help}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            People log in with this email address (verified by the login provider). They see the study once they have
            logged in; an invitation not used within 3 months expires.
          </p>
        </InfoTip>
      </form>

      {save.isError && <p className="text-sm text-destructive">{save.error.message}</p>}
    </div>
  );
}
