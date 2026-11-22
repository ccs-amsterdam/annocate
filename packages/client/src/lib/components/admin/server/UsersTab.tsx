import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { AccountRole, AdminUser, Limits, Plan } from "@annotinder/contracts";
import { Ban, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ServerApi } from "../../../api/serverApi";
import { formatWhen } from "../../../admin/format";
import { LIMITS, limitText, selectClass, usePlans, useInvalidate } from "./shared";
import { Table, ErrorLine } from "./ui";

// The server admin's Users tab: accounts, their roles and limits, and adding users.

export function UsersTab({ server, migrating }: { server: ServerApi; migrating: boolean }) {
  const [q, setQ] = useState("");
  const users = useQuery({ queryKey: ["admin", "server", "users", q], queryFn: () => server.listUsers(q) });
  const plans = usePlans(server);
  const invalidate = useInvalidate();
  const update = useMutation({
    mutationFn: (v: { id: number; body: Parameters<ServerApi["updateUser"]>[1] }) => server.updateUser(v.id, v.body),
    onSuccess: invalidate,
  });
  const withdraw = useMutation({ mutationFn: (id: number) => server.deleteInvitation(id), onSuccess: invalidate });
  const [limitsOf, setLimitsOf] = useState<AdminUser | null>(null);
  const planName = (id: number | null) => plans.data?.find((p) => p.id === id)?.name;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="Search by email" value={q} onChange={(e) => setQ(e.target.value)} />
        <AddUser server={server} plans={plans.data ?? []} />
      </div>
      <ErrorLine error={update.error ?? withdraw.error} />
      <Table head={["Email", "Role", "Plan", "Limits", "Studies", "Last login", ""]}>
        {(users.data ?? []).map((u) => (
          <tr key={u.id} className={`border-b last:border-0 ${u.blockedAt ? "opacity-60" : ""}`}>
            <td className="p-2">
              {u.email}
              {u.blockedAt && <span className="ml-1.5 text-xs text-destructive">blocked</span>}
              <UserStatus
                user={u}
                migrating={migrating}
                onRestore={() => update.mutate({ id: u.id, body: { restoreRoles: true } })}
              />
            </td>
            <td className="p-2">
              <select
                className={selectClass}
                value={u.role}
                title={
                  u.roleVia === "domain"
                    ? "Researcher by their email domain"
                    : u.roleVia === "everyone"
                      ? "Researcher by open registration"
                      : undefined
                }
                onChange={(e) => update.mutate({ id: u.id, body: { role: e.target.value as AccountRole } })}
              >
                <option value="user">User</option>
                <option value="researcher">Researcher</option>
                <option value="admin">Admin</option>
              </select>
              {u.roleVia === "domain" && <span className="ml-1 text-xs text-muted-foreground">(domain)</span>}
              {u.roleVia === "everyone" && <span className="ml-1 text-xs text-muted-foreground">(open)</span>}
            </td>
            <td className="p-2">
              <select
                className={selectClass}
                value={u.planId ?? ""}
                onChange={(e) =>
                  update.mutate({ id: u.id, body: { planId: e.target.value === "" ? null : Number(e.target.value) } })
                }
              >
                <option value="">Default (or domain)</option>
                {(plans.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </td>
            <td className="p-2">
              <button
                type="button"
                className="cursor-pointer text-xs text-primary underline underline-offset-2"
                onClick={() => setLimitsOf(u)}
              >
                {Object.keys(u.limits).length > 0
                  ? "Own limits…"
                  : `${u.effectiveLimits.studies == null ? "∞" : u.effectiveLimits.studies} studies…`}
              </button>
            </td>
            <td className="p-2 tabular-nums">{u.studies}</td>
            <td className="p-2 whitespace-nowrap text-muted-foreground">{formatWhen(u.lastLogin)}</td>
            <td className="p-2 text-right whitespace-nowrap">
              {!u.registered && (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => confirm(`Withdraw the invitation of ${u.email}?`) && withdraw.mutate(u.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Withdraw
                </Button>
              )}
              {u.registered && (
                <Button
                  size="xs"
                  variant={u.blockedAt ? "outline" : "ghost"}
                  onClick={() => {
                    if (
                      u.blockedAt ||
                      confirm(
                        `Block ${u.email}? They are logged out, and can't log in or use API keys until unblocked.`,
                      )
                    ) {
                      update.mutate({ id: u.id, body: { blocked: !u.blockedAt } });
                    }
                  }}
                >
                  <Ban className="h-3.5 w-3.5" /> {u.blockedAt ? "Unblock" : "Block"}
                </Button>
              )}
            </td>
          </tr>
        ))}
      </Table>
      {limitsOf && (
        <LimitsDialog
          user={limitsOf}
          planName={planName(limitsOf.planId) ?? "Default (or domain)"}
          onClose={() => setLimitsOf(null)}
          onSave={(limits) =>
            update.mutate({ id: limitsOf.id, body: { limits } }, { onSuccess: () => setLimitsOf(null) })
          }
        />
      )}
    </div>
  );
}

/**
 * Where a user's account stands (docs/accounts.md): invited and not logged
 * in yet (or too late: the invitation expired), roles the safeguards turned
 * off (restorable), no second factor at their latest login, and, while
 * moving to another login provider, not linked yet.
 */
function UserStatus({ user, migrating, onRestore }: { user: AdminUser; migrating: boolean; onRestore: () => void }) {
  const badge = "ml-1.5 rounded px-1 py-px text-[10px] font-medium";
  return (
    <>
      {!user.registered &&
        (user.invitationExpired ? (
          <span
            className={`${badge} bg-destructive/10 text-destructive`}
            title="Not claimed within 3 months: their roles won't apply at login, until restored"
          >
            invitation expired
          </span>
        ) : (
          <span
            className={`${badge} bg-muted text-muted-foreground`}
            title="Their first login with this (verified) email address claims the account"
          >
            invited
          </span>
        ))}
      {migrating && user.registered && !user.linked && (
        <span
          className={`${badge} bg-amber-500/15 text-amber-700`}
          title="Hasn't linked a login at the new login provider yet"
        >
          not linked
        </span>
      )}
      {user.registered && user.emailVerified === false && (
        <span
          className={`${badge} bg-amber-500/15 text-amber-700`}
          title="Their login provider didn't confirm their email address at their latest login"
        >
          email not verified
        </span>
      )}
      {user.registered && !user.hasMfa && (
        <span
          className={`${badge} bg-amber-500/15 text-amber-700`}
          title="Their latest login didn't use a second factor"
        >
          no 2FA
        </span>
      )}
      {user.rolesDisabled > 0 && (
        <button
          type="button"
          className={`${badge} cursor-pointer bg-amber-500/15 text-amber-700 hover:underline`}
          title="The safeguards turned off roles of theirs (back after a year without a second factor, or an invitation claimed late). Click to restore them."
          onClick={() =>
            confirm(
              `Restore ${user.rolesDisabled} role(s) of ${user.email}? Only if you're sure this is still the same person.`,
            ) && onRestore()
          }
        >
          <RotateCcw className="mr-0.5 inline h-2.5 w-2.5" />
          {user.rolesDisabled} role{user.rolesDisabled === 1 ? "" : "s"} off
        </button>
      )}
    </>
  );
}

function AddUser({ server, plans }: { server: ServerApi; plans: Plan[] }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AccountRole>("researcher");
  const [planId, setPlanId] = useState<number | null>(null);
  const invalidate = useInvalidate();
  const add = useMutation({
    mutationFn: () => server.createUser({ email, role, planId }),
    onSuccess: () => (setEmail(""), invalidate()),
  });
  return (
    <form
      className="flex flex-wrap items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <Input
        className="h-8 w-56 text-xs"
        type="email"
        placeholder="Invite by email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <select className={selectClass} value={role} onChange={(e) => setRole(e.target.value as AccountRole)}>
        <option value="user">User</option>
        <option value="researcher">Researcher</option>
        <option value="admin">Admin</option>
      </select>
      <select
        className={selectClass}
        value={planId ?? ""}
        onChange={(e) => setPlanId(e.target.value === "" ? null : Number(e.target.value))}
      >
        <option value="">Default plan</option>
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <Button size="sm" type="submit" disabled={!email || add.isPending}>
        <Plus className="h-3.5 w-3.5" /> Invite
      </Button>
      <ErrorLine error={add.error} />
    </form>
  );
}

/** A user's own limits, on top of their plan: empty takes the plan's. */
function LimitsDialog({
  user,
  planName,
  onClose,
  onSave,
}: {
  user: AdminUser;
  planName: string;
  onClose: () => void;
  onSave: (limits: Limits) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      LIMITS.map(({ key }) => [
        key,
        user.limits[key] === undefined ? "" : user.limits[key] === null ? "none" : String(user.limits[key]),
      ]),
    ),
  );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Limits of {user.email}</DialogTitle>
          <DialogDescription>
            Empty: the plan&apos;s ({planName}). A number, or &quot;none&quot; for no limit, applies to this user only.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[auto_7rem_auto] items-center gap-x-3 gap-y-2 text-sm">
          {LIMITS.map(({ key, label }) => (
            <div key={key} className="contents">
              <span>{label}</span>
              <Input
                className="h-8 text-xs"
                value={values[key]}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
              />
              <span className="text-xs text-muted-foreground">now {limitText(user.effectiveLimits[key])}</span>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const limits: Limits = {};
              for (const { key } of LIMITS) {
                const v = values[key].trim().toLowerCase();
                if (v === "") continue;
                limits[key] = v === "none" ? null : Math.max(0, Math.floor(Number(v)) || 0);
              }
              onSave(limits);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
