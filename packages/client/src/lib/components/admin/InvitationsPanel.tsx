import { useState } from "react";
import type { CoderInviteResponse, CoderInviteWrite, TopLevelItem, UnitsetResponse } from "@annotinder/contracts";
import { AlertTriangle, Ban, Check, Copy, Split, Trash2 } from "lucide-react";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import {
  useCodebookQuery,
  useCreateInviteMutation,
  useDeleteInviteMutation,
  useDeploymentQuery,
  useInvitesQuery,
  useRevokeInviteMutation,
  useSetInviteUnitsetMutation,
  useUnitsetsQuery,
} from "../../admin/queries";
import { flattenTree } from "../../codebook/tree";
import { DivideUnits } from "./DivideUnits";
import { formatWhen } from "../../admin/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HelpButton } from "../../help/HelpButton";

type InviteUrl = (invite: CoderInviteResponse) => string;

interface InvitationsPanelProps {
  client: ResearcherApi;
  baseUrl: string;
  /** Builds the link coders open for an invite (host-app specific). */
  inviteUrl?: InviteUrl;
}

/**
 * Invitation links (docs/client.md §7): create them, and see all of them
 * with how often they were used. Used invites can only be revoked, not
 * deleted: coders and their answers refer to the invite they came from.
 */
export function InvitationsPanel({ client, baseUrl, inviteUrl }: InvitationsPanelProps) {
  const invitesQuery = useInvitesQuery(client);
  const unitsets = useUnitsetsQuery(client).data ?? [];
  const [dividing, setDividing] = useState(false);
  const usesInvitationUnits = useLiveCodebookUsesInvitationUnits(client);
  const withoutUnits = (invitesQuery.data ?? []).filter((i) => !i.revokedAt && i.unitsetId == null);
  const linkOf = (invite: CoderInviteResponse) => {
    const url = inviteUrl ? inviteUrl(invite) : `${baseUrl}/invite/${invite.secret}`;
    return invite.participantFromUrl ? `${url}${url.includes("?") ? "&" : "?"}participant=<id>` : url;
  };

  return (
    <div className="flex flex-col gap-6">
      {dividing ? (
        <DivideUnits client={client} onDone={() => setDividing(false)} />
      ) : (
        <div className="flex flex-col gap-2">
          <CreateInviteForm client={client} unitsets={unitsets} />
          <Button variant="outline" className="self-start" onClick={() => setDividing(true)}>
            <Split className="mr-1 h-4 w-4" /> Divide units over coders…
          </Button>
        </div>
      )}

      {usesInvitationUnits && withoutUnits.length > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-amber-500 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          The live codebook gives coders the units of their invitation, but{" "}
          {withoutUnits.map((i) => `"${i.label}"`).join(", ")} {withoutUnits.length === 1 ? "has" : "have"} none: coders
          joining with {withoutUnits.length === 1 ? "it" : "them"} get no units there. Choose units below.
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="flex items-center gap-1.5 text-lg font-medium">
          Invitations <HelpButton topic="invitations" label="Help: invitations" />
        </h2>
        <p className="text-xs text-muted-foreground">
          Revoking an invitation stops new coders from joining with it; coders who already started keep working.
          Invitations that were used can't be deleted, because coders and their answers refer to them.
        </p>
        {invitesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading invitations...</p>
        ) : (invitesQuery.data ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No invitations yet. Create one above to give coders access.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                  <th className="p-2 font-medium">Label</th>
                  <th className="p-2 font-medium">Link</th>
                  <th className="p-2 font-medium">Participant id</th>
                  <th className="p-2 font-medium">Presets</th>
                  <th className="p-2 font-medium">Units</th>
                  <th className="p-2 font-medium">Uses</th>
                  <th className="p-2 font-medium">Status</th>
                  <th className="p-2 font-medium">Created</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {invitesQuery.data!.map((invite) => (
                  <InviteRow key={invite.id} client={client} invite={invite} link={linkOf(invite)} unitsets={unitsets} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

type InviteStatus = "open" | "used up" | "revoked";

function statusOf(invite: CoderInviteResponse): InviteStatus {
  if (invite.revokedAt) return "revoked";
  if (invite.maxUses !== undefined && invite.uses >= invite.maxUses) return "used up";
  return "open";
}

const STATUS_STYLE: Record<InviteStatus, string> = {
  open: "bg-primary/15 text-primary",
  "used up": "bg-muted text-muted-foreground",
  revoked: "bg-destructive/10 text-destructive",
};

function InviteRow({
  client,
  invite,
  link,
  unitsets,
}: {
  client: ResearcherApi;
  invite: CoderInviteResponse;
  link: string;
  unitsets: UnitsetResponse[];
}) {
  const revoke = useRevokeInviteMutation(client);
  const remove = useDeleteInviteMutation(client);
  const setUnitset = useSetInviteUnitsetMutation(client);
  const status = statusOf(invite);
  const presets = Object.entries(invite.variables ?? {});
  const error = revoke.error ?? remove.error ?? setUnitset.error;

  return (
    <tr className="border-b align-top last:border-0">
      <td className="p-2 font-medium">{invite.label}</td>
      <td className="p-2">
        <CopyLink link={link} disabled={status === "revoked"} />
      </td>
      <td className="p-2 text-muted-foreground">
        {invite.participantId ?? (invite.participantFromUrl ? "from URL" : "–")}
      </td>
      <td className="p-2 font-mono text-xs text-muted-foreground">
        {presets.length > 0 ? presets.map(([k, v]) => `${k}=${v}`).join(", ") : "–"}
      </td>
      <td className="p-2">
        <UnitsetSelect
          unitsets={unitsets}
          value={invite.unitsetId ?? null}
          disabled={setUnitset.isPending}
          onChange={(unitsetId) => setUnitset.mutate({ id: invite.id, unitsetId })}
        />
      </td>
      <td className="p-2 tabular-nums">
        {invite.uses}
        {invite.maxUses !== undefined && <span className="text-muted-foreground"> / {invite.maxUses}</span>}
      </td>
      <td className="p-2">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[status]}`}>{status}</span>
      </td>
      <td className="p-2 whitespace-nowrap text-muted-foreground">{formatWhen(invite.created)}</td>
      <td className="p-2">
        <div className="flex justify-end gap-1">
          {invite.uses === 0 ? (
            <Button
              size="sm"
              variant="ghost"
              title="Delete this invitation"
              disabled={remove.isPending}
              onClick={() => confirm(`Delete invitation "${invite.label}"?`) && remove.mutate(invite.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : (
            status !== "revoked" && (
              <Button
                size="sm"
                variant="ghost"
                title="Stop new coders from joining with this link"
                disabled={revoke.isPending}
                onClick={() =>
                  confirm(`Revoke "${invite.label}"? New coders can't join with it; started coders keep working.`) &&
                  revoke.mutate(invite.id)
                }
              >
                <Ban className="mr-1 h-3.5 w-3.5" />
                Revoke
              </Button>
            )
          )}
        </div>
        {error && <p className="mt-1 text-xs text-destructive">{error.message}</p>}
      </td>
    </tr>
  );
}

function CopyLink({ link, disabled }: { link: string; disabled: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled}
      title={link}
      onClick={async () => {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

/** The units an invitation's coders get in loops with "the invitation's units". */
function UnitsetSelect({
  unitsets,
  value,
  disabled,
  onChange,
}: {
  unitsets: UnitsetResponse[];
  value: number | null;
  disabled?: boolean;
  onChange: (unitsetId: number | null) => void;
}) {
  return (
    <select
      className="h-8 max-w-40 rounded-md border border-input bg-background px-2 text-xs"
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
    >
      <option value="">–</option>
      {unitsets.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name} ({u.unitIds.length})
        </option>
      ))}
    </select>
  );
}

/** Whether the live codebook has a unit loop with "the invitation's units". */
function useLiveCodebookUsesInvitationUnits(client: ResearcherApi): boolean {
  const deployment = useDeploymentQuery(client).data;
  const codebook = useCodebookQuery(client, deployment?.codebookId ?? null).data;
  return flattenTree((codebook?.items ?? []) as TopLevelItem[]).some(
    (item) => item.type === "unit_loop" && item.units.some((b) => b.mode === "invitation"),
  );
}

function CreateInviteForm({ client, unitsets }: { client: ResearcherApi; unitsets: UnitsetResponse[] }) {
  const createInvite = useCreateInviteMutation(client);
  const [unitsetId, setUnitsetId] = useState<number | null>(null);
  const [label, setLabel] = useState("");
  const [auth, setAuth] = useState<CoderInviteWrite["auth"]>("none");
  const [participant, setParticipant] = useState<"none" | "fixed" | "url">("none");
  const [participantId, setParticipantId] = useState("");
  const [presets, setPresets] = useState("");
  const [maxUses, setMaxUses] = useState("");

  async function handleCreate() {
    await createInvite.mutateAsync({
      label,
      auth,
      participantId: participant === "fixed" && participantId ? participantId : undefined,
      participantFromUrl: participant === "url" || undefined,
      variables: parsePresets(presets),
      maxUses: maxUses === "" ? undefined : Number(maxUses),
      unitsetId,
    });
    setUnitsetId(null);
    setLabel("");
    setParticipantId("");
    setPresets("");
    setMaxUses("");
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border p-3">
      <h2 className="text-sm font-medium">Create invitation link</h2>
      <div className="flex items-center gap-2">
        <Input placeholder="Label (e.g. 'Prolific batch 1')" value={label} onChange={(e) => setLabel(e.target.value)} />
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={auth}
          onChange={(e) => setAuth(e.target.value as typeof auth)}
        >
          <option value="none">No login</option>
          <option value="optional">Login optional (not supported yet)</option>
          <option value="required">Login required (not supported yet)</option>
        </select>
        <Button onClick={handleCreate} disabled={!label || createInvite.isPending}>
          {createInvite.isPending ? "Creating..." : "Create"}
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={participant}
          onChange={(e) => setParticipant(e.target.value as typeof participant)}
        >
          <option value="none">No participant id</option>
          <option value="fixed">Fixed participant id</option>
          <option value="url">Participant id from URL</option>
        </select>
        {participant === "fixed" && (
          <Input placeholder="Participant id" value={participantId} onChange={(e) => setParticipantId(e.target.value)} />
        )}
      </div>
      <div className="flex items-center gap-2">
        <Input
          placeholder="Preset variables, e.g. slot=2, group=treatment"
          value={presets}
          onChange={(e) => setPresets(e.target.value)}
        />
        <Input
          type="number"
          min={1}
          className="w-32"
          placeholder="Max uses"
          value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
        />
        <label className="flex items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
          Units
          <UnitsetSelect unitsets={unitsets} value={unitsetId} onChange={setUnitsetId} />
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Presets set the codebook&apos;s auto variables with source &quot;Set by invitation&quot; for everyone using
        this link. Units are what its coders get in unit loops with &quot;The invitation&apos;s units&quot;: use one
        link per coder (e.g. with a fixed participant id) to give specific coders specific units, or divide units over
        coders below. Without login, work stays on the device it was started on; coders can move it with &quot;Continue
        on another device&quot;. A participant id is a label, never a way back into a session.
      </p>
      {createInvite.isError && <p className="text-sm text-destructive">{createInvite.error.message}</p>}
    </section>
  );
}

/** "slot=2, group=treatment" -> { slot: "2", group: "treatment" } */
function parsePresets(text: string): Record<string, string> | undefined {
  const entries = text
    .split(",")
    .map((pair) => pair.split("=").map((s) => s.trim()))
    .filter(([name, value]) => name && value !== undefined && value !== "");
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}
