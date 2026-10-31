import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccountRole, AdminUser, Limits, Plan, ServerSettings } from "@annotinder/contracts";
import { Ban, Check, ChevronLeft, Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ServerApi } from "../../../api/serverApi";
import { ResearcherApiError } from "../../../api/httpResearcherApi";
import { formatWhen } from "../../../admin/format";
import { HelpButton } from "../../../help/HelpButton";

const TABS = ["Users", "Requests", "Invites", "Plans", "Registration", "Jobs", "Log"] as const;
type Tab = (typeof TABS)[number];

const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-xs";

const LIMITS: { key: keyof Limits; label: string }[] = [
  { key: "jobs", label: "Jobs" },
  { key: "unitsPerJob", label: "Units per job" },
  { key: "units", label: "Units in all jobs" },
  { key: "codersPerJob", label: "Coders per job" },
  { key: "answersPerJob", label: "Answers per job" },
];

const errorText = (e: unknown) => (e instanceof ResearcherApiError ? e.reason : e instanceof Error ? e.message : String(e));
const limitText = (v: number | null | undefined) => (v == null ? "no limit" : v.toLocaleString());

/**
 * The server admin's page (docs/accounts.md): users and their roles and
 * limits, requests to become a researcher, researcher invite links, plans,
 * registration and size settings, jobs (suspend, owner) and the log of admin
 * actions. Admins don't see job data here.
 */
export function ServerAdmin({ server, onBack }: { server: ServerApi; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>("Users");
  const requests = useQuery({ queryKey: ["admin", "server", "requests"], queryFn: () => server.listRequests() });
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" /> All jobs
        </Button>
        <h1 className="flex items-center gap-1.5 text-2xl font-bold tracking-tight">
          Server admin <HelpButton topic="server-admin" label="Help: server admin" />
        </h1>
      </div>
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
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white">{requests.data!.length}</span>
            )}
          </button>
        ))}
      </div>
      {tab === "Users" && <UsersTab server={server} />}
      {tab === "Requests" && <RequestsTab server={server} />}
      {tab === "Invites" && <InvitesTab server={server} />}
      {tab === "Plans" && <PlansTab server={server} />}
      {tab === "Registration" && <RegistrationTab server={server} />}
      {tab === "Jobs" && <JobsTab server={server} />}
      {tab === "Log" && <LogTab server={server} />}
    </div>
  );
}

function usePlans(server: ServerApi) {
  return useQuery({ queryKey: ["admin", "server", "plans"], queryFn: () => server.listPlans() });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["admin", "server"] });
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            {head.map((h, i) => (
              <th key={i} className="p-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function ErrorLine({ error }: { error: unknown }) {
  return error ? <p className="text-sm text-destructive">{errorText(error)}</p> : null;
}

// ---- users -------------------------------------------------------------------

function UsersTab({ server }: { server: ServerApi }) {
  const [q, setQ] = useState("");
  const users = useQuery({ queryKey: ["admin", "server", "users", q], queryFn: () => server.listUsers(q) });
  const plans = usePlans(server);
  const invalidate = useInvalidate();
  const resetPasskeys = useMutation({ mutationFn: (id: number) => server.resetPasskeys(id), onSuccess: invalidate });
  const update = useMutation({ mutationFn: (v: { id: number; body: Parameters<ServerApi["updateUser"]>[1] }) => server.updateUser(v.id, v.body), onSuccess: invalidate });
  const [limitsOf, setLimitsOf] = useState<AdminUser | null>(null);
  const planName = (id: number | null) => plans.data?.find((p) => p.id === id)?.name;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="Search by email" value={q} onChange={(e) => setQ(e.target.value)} />
        <AddUser server={server} plans={plans.data ?? []} />
      </div>
      <ErrorLine error={update.error} />
      <Table head={["Email", "Role", "Plan", "Limits", "Jobs", "Last login", ""]}>
        {(users.data ?? []).map((u) => (
          <tr key={u.id} className={`border-b last:border-0 ${u.blockedAt ? "opacity-60" : ""}`}>
            <td className="p-2">
              {u.email}
              {u.blockedAt && <span className="ml-1.5 text-xs text-destructive">blocked</span>}
            </td>
            <td className="p-2">
              <select className={selectClass} value={u.role} onChange={(e) => update.mutate({ id: u.id, body: { role: e.target.value as AccountRole } })}>
                <option value="user">User</option>
                <option value="researcher">Researcher</option>
                <option value="admin">Admin</option>
              </select>
            </td>
            <td className="p-2">
              <select
                className={selectClass}
                value={u.planId ?? ""}
                onChange={(e) => update.mutate({ id: u.id, body: { planId: e.target.value === "" ? null : Number(e.target.value) } })}
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
              <button type="button" className="cursor-pointer text-xs text-primary underline underline-offset-2" onClick={() => setLimitsOf(u)}>
                {Object.keys(u.limits).length > 0 ? "Own limits…" : `${u.effectiveLimits.jobs == null ? "∞" : u.effectiveLimits.jobs} jobs…`}
              </button>
            </td>
            <td className="p-2 tabular-nums">{u.jobs}</td>
            <td className="p-2 whitespace-nowrap text-muted-foreground">{formatWhen(u.lastLogin)}</td>
            <td className="p-2 text-right">
              <Button
                size="xs"
                variant={u.blockedAt ? "outline" : "ghost"}
                onClick={() => {
                  if (u.blockedAt || confirm(`Block ${u.email}? They are logged out, and can't log in or use API keys until unblocked.`)) {
                    update.mutate({ id: u.id, body: { blocked: !u.blockedAt } });
                  }
                }}
              >
                <Ban className="h-3.5 w-3.5" /> {u.blockedAt ? "Unblock" : "Block"}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                title="For a user who lost their passkeys and recovery codes: they add a new passkey at their next login"
                onClick={() => {
                  if (confirm(`Reset the passkeys of ${u.email}? Only after checking who they are another way than by email (e.g. a video call). They are logged out, and add a new passkey at their next login.`)) {
                    resetPasskeys.mutate(u.id);
                  }
                }}
              >
                Reset passkeys
              </Button>
            </td>
          </tr>
        ))}
      </Table>
      {limitsOf && (
        <LimitsDialog
          user={limitsOf}
          planName={planName(limitsOf.planId) ?? "Default (or domain)"}
          onClose={() => setLimitsOf(null)}
          onSave={(limits) => update.mutate({ id: limitsOf.id, body: { limits } }, { onSuccess: () => setLimitsOf(null) })}
        />
      )}
    </div>
  );
}

function AddUser({ server, plans }: { server: ServerApi; plans: Plan[] }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AccountRole>("researcher");
  const [planId, setPlanId] = useState<number | null>(null);
  const invalidate = useInvalidate();
  const add = useMutation({ mutationFn: () => server.createUser({ email, role, planId }), onSuccess: () => (setEmail(""), invalidate()) });
  return (
    <form
      className="flex flex-wrap items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <Input className="h-8 w-56 text-xs" type="email" placeholder="Add a user by email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <select className={selectClass} value={role} onChange={(e) => setRole(e.target.value as AccountRole)}>
        <option value="user">User</option>
        <option value="researcher">Researcher</option>
        <option value="admin">Admin</option>
      </select>
      <select className={selectClass} value={planId ?? ""} onChange={(e) => setPlanId(e.target.value === "" ? null : Number(e.target.value))}>
        <option value="">Default plan</option>
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <Button size="sm" type="submit" disabled={!email || add.isPending}>
        <Plus className="h-3.5 w-3.5" /> Add
      </Button>
      <ErrorLine error={add.error} />
    </form>
  );
}

/** A user's own limits, on top of their plan: empty takes the plan's. */
function LimitsDialog({ user, planName, onClose, onSave }: { user: AdminUser; planName: string; onClose: () => void; onSave: (limits: Limits) => void }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(LIMITS.map(({ key }) => [key, user.limits[key] === undefined ? "" : user.limits[key] === null ? "none" : String(user.limits[key])])),
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
              <Input className="h-8 text-xs" value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
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

// ---- requests and invites ------------------------------------------------------

function RequestsTab({ server }: { server: ServerApi }) {
  const requests = useQuery({ queryKey: ["admin", "server", "requests"], queryFn: () => server.listRequests() });
  const invalidate = useInvalidate();
  const decide = useMutation({ mutationFn: (v: { userId: number; approve: boolean }) => server.decideRequest(v.userId, v.approve), onSuccess: invalidate });
  if ((requests.data ?? []).length === 0) return <p className="text-sm text-muted-foreground">No open requests to become a researcher.</p>;
  return (
    <div className="flex flex-col gap-2">
      <ErrorLine error={decide.error} />
      {requests.data!.map((r) => (
        <div key={r.userId} className="flex flex-wrap items-start gap-3 rounded-lg border p-3">
          <div className="min-w-0 flex-1">
            <div className="font-medium">{r.email}</div>
            <div className="text-xs text-muted-foreground">asked {formatWhen(r.at)}</div>
            {r.message && <p className="mt-1 text-sm whitespace-pre-wrap">{r.message}</p>}
          </div>
          <Button size="sm" onClick={() => decide.mutate({ userId: r.userId, approve: true })}>
            <Check className="h-3.5 w-3.5" /> Make researcher
          </Button>
          <Button size="sm" variant="outline" onClick={() => decide.mutate({ userId: r.userId, approve: false })}>
            Deny
          </Button>
        </div>
      ))}
    </div>
  );
}

/** The link a researcher invite is used with: this app, which redeems it after login. */
const inviteLink = (secret: string) => `${window.location.origin}${window.location.pathname}?researcherInvite=${secret}`;

function InvitesTab({ server }: { server: ServerApi }) {
  const invites = useQuery({ queryKey: ["admin", "server", "invites"], queryFn: () => server.listInvites() });
  const plans = usePlans(server);
  const invalidate = useInvalidate();
  const [label, setLabel] = useState("");
  const [planId, setPlanId] = useState<number | null>(null);
  const [days, setDays] = useState(14);
  const create = useMutation({ mutationFn: () => server.createInvite({ label, planId, days }), onSuccess: () => (setLabel(""), invalidate()) });
  const revoke = useMutation({ mutationFn: (id: number) => server.revokeInvite(id), onSuccess: invalidate });
  const [copied, setCopied] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Whoever logs in with an invite link becomes a researcher (once), with the invite&apos;s plan if they have none of their own.
      </p>
      <form
        className="flex flex-wrap items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Input className="h-8 w-56 text-xs" placeholder="For whom, e.g. Jane (UvA)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <select className={selectClass} value={planId ?? ""} onChange={(e) => setPlanId(e.target.value === "" ? null : Number(e.target.value))}>
          <option value="">Default plan</option>
          {(plans.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs">
          valid for
          <Input type="number" min={1} max={365} className="h-8 w-16 text-xs" value={days} onChange={(e) => setDays(Number(e.target.value) || 14)} />
          days
        </label>
        <Button size="sm" type="submit" disabled={!label || create.isPending}>
          <Plus className="h-3.5 w-3.5" /> Create link
        </Button>
      </form>
      <ErrorLine error={create.error ?? revoke.error} />
      <Table head={["For", "Plan", "Status", "Created", ""]}>
        {(invites.data ?? []).map((i) => {
          const open = !i.usedAt && !i.revokedAt && new Date(i.expires) > new Date();
          return (
            <tr key={i.id} className="border-b last:border-0">
              <td className="p-2">{i.label}</td>
              <td className="p-2 text-muted-foreground">{plans.data?.find((p) => p.id === i.planId)?.name ?? "Default"}</td>
              <td className="p-2 text-xs">
                {i.usedAt ? `used by ${i.usedBy ?? "?"}` : i.revokedAt ? "revoked" : open ? `open until ${new Date(i.expires).toLocaleDateString()}` : "expired"}
              </td>
              <td className="p-2 whitespace-nowrap text-muted-foreground">
                {formatWhen(i.created)} by {i.createdBy}
              </td>
              <td className="p-2 text-right whitespace-nowrap">
                {open && (
                  <>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => void navigator.clipboard?.writeText(inviteLink(i.secret)).then(() => setCopied(i.id))}
                    >
                      {copied === i.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy link
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => revoke.mutate(i.id)}>
                      Revoke
                    </Button>
                  </>
                )}
              </td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}

// ---- plans and registration --------------------------------------------------

function PlansTab({ server }: { server: ServerApi }) {
  const plans = usePlans(server);
  const settings = useQuery({ queryKey: ["admin", "server", "settings"], queryFn: () => server.getSettings() });
  const invalidate = useInvalidate();
  const create = useMutation({ mutationFn: () => server.createPlan({ name: `Plan ${(plans.data?.length ?? 0) + 1}`, limits: {} }), onSuccess: invalidate });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        A plan is a set of limits. Researchers get the default plan (Registration), their email domain&apos;s, or the one set on
        them; an empty field is no limit. Limits apply when something is added: nothing is removed when they shrink.
      </p>
      {(plans.data ?? []).map((p) => (
        <PlanRow key={`${p.id}-${JSON.stringify(p)}`} server={server} plan={p} isDefault={settings.data?.defaultPlanId === p.id} />
      ))}
      <Button size="sm" variant="outline" className="w-fit" onClick={() => create.mutate()}>
        <Plus className="h-3.5 w-3.5" /> Add plan
      </Button>
      <ErrorLine error={create.error} />
    </div>
  );
}

function PlanRow({ server, plan, isDefault }: { server: ServerApi; plan: Plan; isDefault: boolean }) {
  const [name, setName] = useState(plan.name);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(LIMITS.map(({ key }) => [key, plan.limits[key] == null ? "" : String(plan.limits[key])])),
  );
  const invalidate = useInvalidate();
  const save = useMutation({
    mutationFn: () =>
      server.updatePlan(plan.id, {
        name,
        limits: Object.fromEntries(LIMITS.map(({ key }) => [key, values[key].trim() === "" ? null : Math.max(0, Math.floor(Number(values[key])) || 0)])),
      }),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: () => server.deletePlan(plan.id), onSuccess: invalidate });
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="h-8 w-48 text-sm font-medium" value={name} onChange={(e) => setName(e.target.value)} />
        {isDefault && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">default</span>}
        <span className="ml-auto flex gap-1">
          <Button size="xs" onClick={() => save.mutate()} disabled={save.isPending}>
            Save
          </Button>
          <Button size="xs" variant="ghost" aria-label={`Delete ${plan.name}`} onClick={() => confirm(`Delete plan ${plan.name}?`) && remove.mutate()}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {LIMITS.map(({ key, label }) => (
          <label key={key} className="flex flex-col gap-1 text-xs text-muted-foreground">
            {label}
            <Input
              type="number"
              min={0}
              className="h-8 text-xs"
              placeholder="no limit"
              value={values[key]}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <ErrorLine error={save.error ?? remove.error} />
    </div>
  );
}

function RegistrationTab({ server }: { server: ServerApi }) {
  const settings = useQuery({ queryKey: ["admin", "server", "settings"], queryFn: () => server.getSettings() });
  const plans = usePlans(server);
  if (!settings.data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="flex flex-col gap-6">
      <SettingsForm key={JSON.stringify(settings.data)} server={server} settings={settings.data} plans={plans.data ?? []} />
      <Domains server={server} plans={plans.data ?? []} />
    </div>
  );
}

function SettingsForm({ server, settings, plans }: { server: ServerApi; settings: ServerSettings; plans: Plan[] }) {
  const [draft, setDraft] = useState(settings);
  const invalidate = useInvalidate();
  const save = useMutation({ mutationFn: () => server.putSettings(draft), onSuccess: invalidate });
  const kb = (bytes: number) => Math.round(bytes / 1024);
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="font-medium">Who becomes a researcher</h2>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={draft.registration.open}
          onChange={(e) => setDraft({ ...draft, registration: { ...draft.registration, open: e.target.checked } })}
        />
        <span>
          Anyone who logs in
          <span className="block text-xs text-muted-foreground">For a public server. Otherwise: email domains (below), invite links, requests, or you.</span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={draft.registration.requests}
          onChange={(e) => setDraft({ ...draft, registration: { ...draft.registration, requests: e.target.checked } })}
        />
        <span>
          Users can ask to become a researcher
          <span className="block text-xs text-muted-foreground">Requests appear under Requests, for an admin to approve.</span>
        </span>
      </label>
      <h2 className="mt-2 font-medium">Limits</h2>
      <div className="grid w-fit grid-cols-[auto_10rem] items-center gap-x-3 gap-y-2 text-sm">
        <span>Default plan</span>
        <select className={selectClass} value={draft.defaultPlanId ?? ""} onChange={(e) => setDraft({ ...draft, defaultPlanId: e.target.value === "" ? null : Number(e.target.value) })}>
          <option value="">None (no limits)</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span>Largest unit (KB)</span>
        <Input type="number" min={1} className="h-8 text-xs" value={kb(draft.unitBytes)} onChange={(e) => setDraft({ ...draft, unitBytes: Math.max(1, Number(e.target.value) || 1) * 1024 })} />
        <span>Largest answer (KB)</span>
        <Input type="number" min={1} className="h-8 text-xs" value={kb(draft.answerBytes)} onChange={(e) => setDraft({ ...draft, answerBytes: Math.max(1, Number(e.target.value) || 1) * 1024 })} />
      </div>
      <p className="text-xs text-muted-foreground">
        Unit and answer sizes hold for everyone: they keep units (e.g. images pasted in as text) and answers from filling the server.
      </p>
      <Button className="w-fit" size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
        Save
      </Button>
      <ErrorLine error={save.error} />
    </section>
  );
}

function Domains({ server, plans }: { server: ServerApi; plans: Plan[] }) {
  const domains = useQuery({ queryKey: ["admin", "server", "domains"], queryFn: () => server.listDomains() });
  const invalidate = useInvalidate();
  const put = useMutation({
    mutationFn: (v: { domain: string; researcher: boolean; planId: number | null }) => server.putDomain(v.domain, { researcher: v.researcher, planId: v.planId }),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (domain: string) => server.deleteDomain(domain), onSuccess: invalidate });
  const [domain, setDomain] = useState("");
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="font-medium">Email domains</h2>
      <p className="text-xs text-muted-foreground">
        Users with an email address at a domain can become researchers when they log in, and get the domain&apos;s plan (e.g. a
        university&apos;s). <code>uni.nl</code> is that domain; <code>*.uni.nl</code> also its subdomains.
      </p>
      <Table head={["Domain", "Makes researchers", "Plan", ""]}>
        {(domains.data ?? []).map((d) => (
          <tr key={d.domain} className="border-b last:border-0">
            <td className="p-2 font-mono text-xs">{d.domain}</td>
            <td className="p-2">
              <input type="checkbox" checked={d.researcher} onChange={(e) => put.mutate({ ...d, researcher: e.target.checked })} />
            </td>
            <td className="p-2">
              <select className={selectClass} value={d.planId ?? ""} onChange={(e) => put.mutate({ ...d, planId: e.target.value === "" ? null : Number(e.target.value) })}>
                <option value="">None</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </td>
            <td className="p-2 text-right">
              <Button size="xs" variant="ghost" aria-label={`Remove ${d.domain}`} onClick={() => remove.mutate(d.domain)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </td>
          </tr>
        ))}
      </Table>
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          put.mutate({ domain, researcher: true, planId: null }, { onSuccess: () => setDomain("") });
        }}
      >
        <Input className="h-8 w-56 text-xs" placeholder="uni.nl or *.uni.nl" value={domain} onChange={(e) => setDomain(e.target.value)} />
        <Button size="sm" type="submit" disabled={!domain}>
          <Plus className="h-3.5 w-3.5" /> Add domain
        </Button>
      </form>
      <ErrorLine error={put.error ?? remove.error} />
    </section>
  );
}

// ---- jobs and log --------------------------------------------------------------

function JobsTab({ server }: { server: ServerApi }) {
  const jobs = useQuery({ queryKey: ["admin", "server", "jobs"], queryFn: () => server.listJobs() });
  const invalidate = useInvalidate();
  const update = useMutation({ mutationFn: (v: { id: number; body: Parameters<ServerApi["updateJob"]>[1] }) => server.updateJob(v.id, v.body), onSuccess: invalidate });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        What each job holds, not its data. A suspended job takes no coders and can&apos;t be changed; its researchers can still read
        and delete its data.
      </p>
      <ErrorLine error={update.error} />
      <Table head={["Job", "Owner", "Units", "Coders", "Answers", "Created", ""]}>
        {(jobs.data ?? []).map((j) => (
          <tr key={j.id} className="border-b last:border-0">
            <td className="p-2">
              #{j.id} {j.name}
              {j.archived && <span className="ml-1.5 text-xs text-muted-foreground">archived</span>}
              {j.suspendedAt && <span className="ml-1.5 text-xs text-destructive">suspended</span>}
            </td>
            <td className="p-2">
              <button
                type="button"
                className="cursor-pointer text-left underline decoration-dotted underline-offset-2"
                title="Move to another researcher"
                onClick={() => {
                  const owner = prompt("New owner (a researcher's email):", j.owner ?? "");
                  if (owner) update.mutate({ id: j.id, body: { owner } });
                }}
              >
                {j.owner ?? "–"}
              </button>
            </td>
            <td className="p-2 tabular-nums">{j.units.toLocaleString()}</td>
            <td className="p-2 tabular-nums">{j.coders.toLocaleString()}</td>
            <td className="p-2 tabular-nums">{j.answers.toLocaleString()}</td>
            <td className="p-2 whitespace-nowrap text-muted-foreground">{formatWhen(j.created)}</td>
            <td className="p-2 text-right">
              <Button
                size="xs"
                variant={j.suspendedAt ? "outline" : "ghost"}
                onClick={() => {
                  if (j.suspendedAt || confirm(`Suspend job #${j.id}? Coders are refused, and its researchers can't change it.`)) {
                    update.mutate({ id: j.id, body: { suspended: !j.suspendedAt } });
                  }
                }}
              >
                {j.suspendedAt ? "Resume" : "Suspend"}
              </Button>
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function LogTab({ server }: { server: ServerApi }) {
  const log = useQuery({ queryKey: ["admin", "server", "log"], queryFn: () => server.listLog() });
  return (
    <Table head={["When", "Admin", "Action", "On", "Details"]}>
      {(log.data ?? []).map((e, i) => (
        <tr key={i} className="border-b align-top last:border-0">
          <td className="p-2 whitespace-nowrap text-muted-foreground">{formatWhen(e.at)}</td>
          <td className="p-2">{e.admin}</td>
          <td className="p-2">{e.action}</td>
          <td className="p-2">{e.target}</td>
          <td className="p-2 font-mono text-[11px] break-all text-muted-foreground">{Object.keys(e.details).length ? JSON.stringify(e.details) : ""}</td>
        </tr>
      ))}
    </Table>
  );
}
