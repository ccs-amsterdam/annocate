import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Plan, ServerSettings } from "@annotinder/contracts";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ServerApi } from "../../../api/serverApi";
import { LIMITS, selectClass, usePlans, useInvalidate } from "./shared";
import { Table, ErrorLine } from "./ui";

// The server admin's Plans and Registration tabs: plans with their limits, and who may register.

export function PlansTab({ server }: { server: ServerApi }) {
  const plans = usePlans(server);
  const settings = useQuery({ queryKey: ["admin", "server", "settings"], queryFn: () => server.getSettings() });
  const invalidate = useInvalidate();
  const create = useMutation({
    mutationFn: () => server.createPlan({ name: `Plan ${(plans.data?.length ?? 0) + 1}`, limits: {} }),
    onSuccess: invalidate,
  });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        A plan is a set of limits. Researchers get the default plan (Registration), their email domain&apos;s, or the
        one set on them; an empty field is no limit. Limits apply when something is added: nothing is removed when they
        shrink.
      </p>
      {(plans.data ?? []).map((p) => (
        <PlanRow
          key={`${p.id}-${JSON.stringify(p)}`}
          server={server}
          plan={p}
          isDefault={settings.data?.defaultPlanId === p.id}
        />
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
        limits: Object.fromEntries(
          LIMITS.map(({ key }) => [
            key,
            values[key].trim() === "" ? null : Math.max(0, Math.floor(Number(values[key])) || 0),
          ]),
        ),
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
          <Button
            size="xs"
            variant="ghost"
            aria-label={`Delete ${plan.name}`}
            onClick={() => confirm(`Delete plan ${plan.name}?`) && remove.mutate()}
          >
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

export function RegistrationTab({ server }: { server: ServerApi }) {
  const settings = useQuery({ queryKey: ["admin", "server", "settings"], queryFn: () => server.getSettings() });
  const plans = usePlans(server);
  if (!settings.data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="flex flex-col gap-6">
      <SettingsForm
        key={JSON.stringify(settings.data)}
        server={server}
        settings={settings.data}
        plans={plans.data ?? []}
      />
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
          <span className="block text-xs text-muted-foreground">
            For a public server. Otherwise: email domains (below), invitations by email (Users), requests, or you.
          </span>
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
          <span className="block text-xs text-muted-foreground">
            Requests appear under Requests, for an admin to approve.
          </span>
        </span>
      </label>
      <h2 className="mt-2 font-medium">Limits</h2>
      <div className="grid w-fit grid-cols-[auto_10rem] items-center gap-x-3 gap-y-2 text-sm">
        <span>Default plan</span>
        <select
          className={selectClass}
          value={draft.defaultPlanId ?? ""}
          onChange={(e) => setDraft({ ...draft, defaultPlanId: e.target.value === "" ? null : Number(e.target.value) })}
        >
          <option value="">None (no limits)</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span>Largest unit (KB)</span>
        <Input
          type="number"
          min={1}
          className="h-8 text-xs"
          value={kb(draft.unitBytes)}
          onChange={(e) => setDraft({ ...draft, unitBytes: Math.max(1, Number(e.target.value) || 1) * 1024 })}
        />
        <span>Largest answer (KB)</span>
        <Input
          type="number"
          min={1}
          className="h-8 text-xs"
          value={kb(draft.answerBytes)}
          onChange={(e) => setDraft({ ...draft, answerBytes: Math.max(1, Number(e.target.value) || 1) * 1024 })}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Unit and answer sizes hold for everyone: they keep units (e.g. images pasted in as text) and answers from
        filling the server.
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
    mutationFn: (v: { domain: string; researcher: boolean; planId: number | null }) =>
      server.putDomain(v.domain, { researcher: v.researcher, planId: v.planId }),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (domain: string) => server.deleteDomain(domain), onSuccess: invalidate });
  const [domain, setDomain] = useState("");
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="font-medium">Email domains</h2>
      <p className="text-xs text-muted-foreground">
        Users with an email address at a domain can become researchers when they log in, and get the domain&apos;s plan
        (e.g. a university&apos;s). <code>uni.nl</code> is that domain; <code>*.uni.nl</code> also its subdomains.
      </p>
      <Table head={["Domain", "Makes researchers", "Plan", ""]}>
        {(domains.data ?? []).map((d) => (
          <tr key={d.domain} className="border-b last:border-0">
            <td className="p-2 font-mono text-xs">{d.domain}</td>
            <td className="p-2">
              <input
                type="checkbox"
                checked={d.researcher}
                onChange={(e) => put.mutate({ ...d, researcher: e.target.checked })}
              />
            </td>
            <td className="p-2">
              <select
                className={selectClass}
                value={d.planId ?? ""}
                onChange={(e) => put.mutate({ ...d, planId: e.target.value === "" ? null : Number(e.target.value) })}
              >
                <option value="">None</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </td>
            <td className="p-2 text-right">
              <Button
                size="xs"
                variant="ghost"
                aria-label={`Remove ${d.domain}`}
                onClick={() => remove.mutate(d.domain)}
              >
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
        <Input
          className="h-8 w-56 text-xs"
          placeholder="uni.nl or *.uni.nl"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        />
        <Button size="sm" type="submit" disabled={!domain}>
          <Plus className="h-3.5 w-3.5" /> Add domain
        </Button>
      </form>
      <ErrorLine error={put.error ?? remove.error} />
    </section>
  );
}
