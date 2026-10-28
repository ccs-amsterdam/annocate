import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { JobUser, Role } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useJobUsersMutation, useJobUsersQuery } from "../../../admin/queries";

const ROLES: { value: Role; label: string; help: string }[] = [
  { value: "READ", label: "Read", help: "sees the job and downloads the results" },
  { value: "WRITE", label: "Write", help: "also edits the codebook, units and invitations" },
  { value: "ADMIN", label: "Admin", help: "also manages access, resets and deletes data" },
];

/**
 * Who has access to the job, and with which role (docs/client.md §7): only
 * admins of the job see and change it. The list is saved as a whole; it
 * always keeps an admin.
 */
export function TeamSettings({ client }: { client: ResearcherApi }) {
  const usersQuery = useJobUsersQuery(client);
  const save = useJobUsersMutation(client);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("WRITE");

  if (usersQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (usersQuery.isError) return <p className="text-sm text-muted-foreground">Only admins of this job can see and change who has access.</p>;
  const users = usersQuery.data ?? [];
  const admins = users.filter((u) => u.role === "ADMIN").length;
  const update = (next: JobUser[]) => save.mutate(next);

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <ul className="flex flex-col divide-y rounded-lg border">
        {users.map((u) => {
          const lastAdmin = u.role === "ADMIN" && admins === 1;
          return (
            <li key={u.email} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{u.email}</span>
              <select
                aria-label={`Role of ${u.email}`}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={u.role}
                disabled={save.isPending || lastAdmin}
                title={lastAdmin ? "A job needs at least one admin" : undefined}
                onChange={(e) => update(users.map((x) => (x.email === u.email ? { ...x, role: e.target.value as Role } : x)))}
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
                  if (confirm(`Remove ${u.email}'s access to this job?`)) update(users.filter((x) => x.email !== u.email));
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
          save.mutate([...rest, { email: address, role }], { onSuccess: () => setEmail("") });
        }}
      >
        <Input type="email" className="h-8 w-64 text-sm" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline" disabled={save.isPending || !email.trim()}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </form>
      <ul className="text-[11px] text-muted-foreground">
        {ROLES.map((r) => (
          <li key={r.value}>
            <strong className="font-medium text-foreground">{r.label}</strong>: {r.help}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">
        People log in with this email address. They see the job once they have logged in.
      </p>
      {save.isError && <p className="text-sm text-destructive">{save.error.message}</p>}
    </div>
  );
}
