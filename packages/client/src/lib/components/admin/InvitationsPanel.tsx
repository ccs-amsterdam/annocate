import { useEffect, useState } from "react";
import {
  OVERLAP_SET,
  sessionItem,
  sessionParamKey,
  unitLoops,
  type CoderInviteResponse,
  type CoderInviteWrite,
  type TopLevelItem,
} from "@annotinder/contracts";
import { Ban, Check, Copy, KeyRound, Pencil } from "lucide-react";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import {
  useCodebookQuery,
  useDeploymentQuery,
  useInvitesQuery,
  useRenewInviteSecretMutation,
  useRevokeInviteMutation,
  useSetGroupsQuery,
  useUpdateInviteMutation,
} from "../../admin/queries";
import { loginAvailable } from "../../session/coderSession";
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
 * The job's links (docs/plans/sets-and-session-parameters.md §4): made from
 * the published codebook, one per combination of its link parameters'
 * values. Here their access settings (label, login, emails, max uses), and
 * revoking or renewing a link. Links the codebook no longer makes are
 * retired, never deleted: coders and their answers refer to the link they
 * came from.
 */
export function InvitationsPanel({ client, baseUrl, inviteUrl }: InvitationsPanelProps) {
  const invitesQuery = useInvitesQuery(client);
  const deployment = useDeploymentQuery(client).data;
  const codebook = useCodebookQuery(client, deployment?.codebookId ?? null).data;
  const items = (codebook?.items ?? []) as TopLevelItem[];
  const session = sessionItem(items);
  const groups = useSetGroupsQuery(client).data ?? [];
  const [showRetired, setShowRetired] = useState(false);

  // The URL parameters a link takes, with placeholders the panel (or the researcher) fills in.
  const urlParams = [
    ...(session?.participant ? [`${session.participant.param}=<participant id>`] : []),
    ...(session?.params ?? []).filter((p) => p.kind === "url" && p.default === undefined).map((p) => `${sessionParamKey(p)}=<${p.name}>`),
  ];
  const linkOf = (invite: CoderInviteResponse) => {
    const url = inviteUrl ? inviteUrl(invite) : `${baseUrl}/invite/${invite.secret}`;
    return urlParams.length ? `${url}${url.includes("?") ? "&" : "?"}${urlParams.join("&")}` : url;
  };
  // Loops whose sets are assigned by the login's email: only those emails may code.
  const emailGroups = [
    ...new Set(
      unitLoops(items).flatMap(({ loop }) => loop.units.flatMap((b) => (b.mode === "assign" && "session" in b.from && b.from.session === "email" ? [b.group] : []))),
    ),
  ];

  const links = invitesQuery.data ?? [];
  const active = links.filter((l) => !l.retiredAt);
  const retired = links.filter((l) => l.retiredAt);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="flex items-center gap-1.5 text-lg font-medium">
          Links <HelpButton topic="invitations" label="Help: links" />
        </h2>
        <p className="text-xs text-muted-foreground">
          Publishing the codebook makes its links: one, or one per value of each link parameter (and per combination) in the
          codebook&apos;s Session item, e.g. a link per set of a group. New sets get links at once; links whose value is gone are
          retired. Here you set who may use a link. Revoking stops new coders from joining with it; coders who already started keep
          working.
        </p>
        {urlParams.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Links take these URL parameters (filled in by whoever shares them, e.g. a panel):{" "}
            <span className="font-mono">{urlParams.join("&")}</span>. Any link also takes an optional{" "}
            <span className="font-mono">source=…</span> ($session.source).
          </p>
        )}
        {emailGroups.map((group) => {
          const n = groups.find((g) => g.name === group)?.sets.filter((s) => s.name !== OVERLAP_SET).length ?? 0;
          return (
            <p key={group} className="rounded-md border border-amber-500 bg-amber-500/10 p-2.5 text-xs">
              Sets of group <span className="font-mono">{group}</span> are assigned by email: only the {n} email addresses that are its
              set names can code. Coders log in; other email addresses get &quot;This email address has no access to this study&quot;.
            </p>
          );
        })}
        {invitesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading links...</p>
        ) : active.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {deployment ? "The published codebook makes no links right now (a link parameter without values?)." : "Publish a codebook to get its links."}
          </p>
        ) : (
          <LinkTable client={client} links={active} linkOf={linkOf} />
        )}
      </section>

      {retired.length > 0 && (
        <section className="flex flex-col gap-2">
          <button type="button" className="w-fit cursor-pointer text-sm text-muted-foreground hover:text-foreground" onClick={() => setShowRetired(!showRetired)}>
            {showRetired ? "▾" : "▸"} Retired links ({retired.length}): the codebook no longer makes them; they show &quot;This link is no
            longer active&quot;
          </button>
          {showRetired && <LinkTable client={client} links={retired} linkOf={linkOf} />}
        </section>
      )}
    </div>
  );
}

function LinkTable({ client, links, linkOf }: { client: ResearcherApi; links: CoderInviteResponse[]; linkOf: (invite: CoderInviteResponse) => string }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            <th className="p-2 font-medium">Label</th>
            <th className="p-2 font-medium">Values</th>
            <th className="p-2 font-medium">Link</th>
            <th className="p-2 font-medium">Access</th>
            <th className="p-2 font-medium">Uses</th>
            <th className="p-2 font-medium">Status</th>
            <th className="p-2 font-medium">Created</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {links.map((invite) => (
            <InviteRow key={invite.id} client={client} invite={invite} link={linkOf(invite)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

type InviteStatus = "open" | "used up" | "revoked" | "retired";

function statusOf(invite: CoderInviteResponse): InviteStatus {
  if (invite.retiredAt) return "retired";
  if (invite.revokedAt) return "revoked";
  if (invite.maxUses !== undefined && invite.uses >= invite.maxUses) return "used up";
  return "open";
}

const STATUS_STYLE: Record<InviteStatus, string> = {
  open: "bg-primary/15 text-primary",
  "used up": "bg-muted text-muted-foreground",
  revoked: "bg-destructive/10 text-destructive",
  retired: "bg-muted text-muted-foreground",
};

/** Who may use a link, in a few words. */
function accessOf(invite: CoderInviteResponse): string {
  const login = invite.emails?.length ? `${invite.emails.length} email${invite.emails.length === 1 ? "" : "s"}` : invite.auth === "none" ? "anyone" : `login ${invite.auth}`;
  return [login, invite.participantId ? `participant ${invite.participantId}` : null].filter(Boolean).join(" · ");
}

function InviteRow({ client, invite, link }: { client: ResearcherApi; invite: CoderInviteResponse; link: string }) {
  const revoke = useRevokeInviteMutation(client);
  const renew = useRenewInviteSecretMutation(client);
  const [editing, setEditing] = useState(false);
  const status = statusOf(invite);
  const values = Object.entries(invite.params);
  const error = revoke.error ?? renew.error;

  return (
    <>
      <tr className="border-b align-top last:border-0">
        <td className="p-2 font-medium">{invite.label}</td>
        <td className="p-2 font-mono text-xs text-muted-foreground">{values.length > 0 ? values.map(([k, v]) => `${k}=${v}`).join(", ") : "–"}</td>
        <td className="p-2">
          <CopyLink link={link} disabled={status === "revoked" || status === "retired"} />
        </td>
        <td className="p-2 text-xs text-muted-foreground">{accessOf(invite)}</td>
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
            <Button size="sm" variant="ghost" title="Who may use this link" onClick={() => setEditing(!editing)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              title="A new link: the old one stops working (coders who started keep working)"
              disabled={renew.isPending || status === "retired"}
              onClick={() => confirm(`Make a new link for "${invite.label}"? The current link stops working.`) && renew.mutate(invite.id)}
            >
              <KeyRound className="h-3.5 w-3.5" />
            </Button>
            {status !== "revoked" && status !== "retired" && (
              <Button
                size="sm"
                variant="ghost"
                title="Stop new coders from joining with this link"
                disabled={revoke.isPending}
                onClick={() =>
                  confirm(`Revoke "${invite.label}"? New coders can't join with it; started coders keep working.`) && revoke.mutate(invite.id)
                }
              >
                <Ban className="mr-1 h-3.5 w-3.5" />
                Revoke
              </Button>
            )}
          </div>
          {error && <p className="mt-1 text-xs text-destructive">{error.message}</p>}
        </td>
      </tr>
      {editing && (
        <tr className="border-b bg-muted/30">
          <td colSpan={8} className="p-3">
            <AccessForm client={client} invite={invite} onDone={() => setEditing(false)} />
          </td>
        </tr>
      )}
    </>
  );
}

/** A link's access settings: label, login, email addresses, max uses, a fixed participant id. */
function AccessForm({ client, invite, onDone }: { client: ResearcherApi; invite: CoderInviteResponse; onDone: () => void }) {
  const update = useUpdateInviteMutation(client);
  const [label, setLabel] = useState(invite.label);
  const [auth, setAuth] = useState<CoderInviteWrite["auth"]>(invite.auth);
  const [emails, setEmails] = useState((invite.emails ?? []).join(", "));
  const [maxUses, setMaxUses] = useState(invite.maxUses === undefined ? "" : String(invite.maxUses));
  const [participantId, setParticipantId] = useState(invite.participantId ?? "");
  // Whether this server offers login (coders log in like researchers); null while unknown.
  const [login, setLogin] = useState<boolean | null>(null);
  useEffect(() => {
    void loginAvailable().then(setLogin);
  }, []);

  async function save() {
    await update.mutateAsync({
      id: invite.id,
      body: {
        label,
        auth,
        emails: auth !== "none" && emails.trim() ? emails.split(/[\s,;]+/).filter(Boolean) : undefined,
        maxUses: maxUses === "" ? undefined : Number(maxUses),
        participantId: participantId.trim() || undefined,
      },
    });
    onDone();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Label" className="w-64" placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <select
          aria-label="Login"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={auth}
          onChange={(e) => setAuth(e.target.value as typeof auth)}
        >
          <option value="none">No login</option>
          <option value="optional" disabled={login === false}>
            Login optional{login === false ? " (this server has no login)" : ""}
          </option>
          <option value="required" disabled={login === false}>
            Login required{login === false ? " (this server has no login)" : ""}
          </option>
        </select>
        <Input aria-label="Max uses" type="number" min={1} className="w-32" placeholder="Max uses" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
        <Input
          aria-label="Fixed participant id"
          className="w-48"
          placeholder="Fixed participant id"
          value={participantId}
          onChange={(e) => setParticipantId(e.target.value)}
        />
      </div>
      {auth !== "none" && (
        <Input
          placeholder="Only these email addresses (optional), e.g. ann@uni.nl, bob@uni.nl: coders log in to show who they are"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
        />
      )}
      <p className="text-[11px] text-muted-foreground">
        Without login, work stays on the device it was started on; coders can move it with &quot;Continue on another device&quot;. With
        login, coders continue on any device by logging in there. A participant id is a label, never a way back into a session.{" "}
        <HelpButton topic="online-panels" className="align-middle">
          Online panels
        </HelpButton>
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={!label || update.isPending}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {update.isError && <p className="text-sm text-destructive">{update.error.message}</p>}
    </div>
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
