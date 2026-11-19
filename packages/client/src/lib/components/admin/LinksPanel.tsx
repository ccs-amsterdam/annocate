import { useState } from "react";
import {
  coderAccess,
  designItems,
  sessionItem,
  sessionParamKey,
  type LinkResponse,
  type SessionItem,
  type SessionParam,
  type TopLevelItem,
} from "@annotinder/contracts";
import { Ban, Check, Copy, KeyRound, Pencil } from "lucide-react";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import {
  useDesignVersionQuery,
  useDeploymentQuery,
  useLinksQuery,
  useRenewLinkSecretMutation,
  useRevokeLinkMutation,
  useSetGroupsQuery,
  useUpdateLinkMutation,
} from "../../admin/queries";
import { formatWhen } from "../../admin/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HelpButton } from "../../help/HelpButton";
import { IconButton } from "@/components/ui/icon-button";
import { InfoTip } from "@/components/ui/info-tip";
import { codeLinkUrl } from "../../session/coderSession";

interface LinksPanelProps {
  client: ResearcherApi;
}

/**
 * The study's links (docs/architecture.md §7): made from
 * the deployed design, one per combination of its link parameters'
 * values. Here their access settings (label, login, emails, max uses), and
 * revoking or renewing a link. Links the design no longer makes are
 * retired, never deleted: coders and their answers refer to the link they
 * came from.
 */
export function LinksPanel({ client }: LinksPanelProps) {
  const linksQuery = useLinksQuery(client);
  const deployment = useDeploymentQuery(client).data;
  const version = useDesignVersionQuery(client, deployment?.designVersionId ?? null).data;
  const items = (version ? designItems(version) : []) as TopLevelItem[];
  const session = sessionItem(items);
  // The deployed sets: links are the deployed design's
  const groups = useSetGroupsQuery(client, true).data ?? [];
  const [showRetired, setShowRetired] = useState(false);

  // The URL parameters a link takes, with placeholders the panel (or the researcher) fills in.
  const urlParams = [
    ...(session?.participant ? [`${session.participant.param}=<participant id>`] : []),
    ...(session?.params ?? []).filter((p) => p.kind === "url" && p.default === undefined).map((p) => `${sessionParamKey(p)}=<${p.name}>`),
  ];
  const linkOf = (link: LinkResponse) => {
    const url = codeLinkUrl(link.studyId, link.secret);
    return urlParams.length ? `${url}${url.includes("?") ? "&" : "?"}${urlParams.join("&")}` : url;
  };
  // Coders by email address: only those addresses may code, and they sign in.
  const coderColumn = session?.coders?.column;
  const coderValues = coderColumn ? (groups.find((g) => g.name === coderColumn)?.sets ?? []).map((s) => s.name).filter((n) => !n.startsWith("_")) : [];
  const emailCoders = coderValues.length > 0 && coderAccess(coderValues) === "email";

  const links = linksQuery.data ?? [];
  const active = links.filter((l) => !l.retiredAt);
  const retired = links.filter((l) => l.retiredAt);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="flex items-center gap-1.5 text-lg font-medium">
          Links
          <InfoTip label="About links">
            Deploying the design makes its links: one, or one per value of each link parameter (and per combination) in its Study entry,
            e.g. a link per set of a group. Deployed sets get links; links whose value is gone are retired. Here you set who may use a link.
            Revoking stops new coders from joining with it; coders who already started keep working.
          </InfoTip>
          <HelpButton topic="links" label="Help: links" />
        </h2>
        {urlParams.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Links take these URL parameters (filled in by whoever shares them, e.g. a panel):{" "}
            <span className="font-mono">{urlParams.join("&")}</span>. Any link also takes an optional{" "}
            <span className="font-mono">source=…</span> ($session.source).
          </p>
        )}
        {emailCoders && (
          <div className="rounded-md border border-amber-500 bg-amber-500/10 p-2.5 text-xs">
            The coders (column <span className="font-mono">{coderColumn}</span>) are email addresses, so there is one link: coders sign in and
            get their own units. Other email addresses get &quot;This email address has no access to this study&quot;.
            <details className="mt-1">
              <summary className="cursor-pointer">The {coderValues.length} coders</summary>
              <span className="font-mono">{coderValues.join(", ")}</span>
            </details>
          </div>
        )}
        {linksQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading links...</p>
        ) : active.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {deployment ? "The deployed design makes no links right now (a link parameter without values?)." : "Deploy the design to get its links."}
          </p>
        ) : (
          <LinkTable client={client} links={active} linkOf={linkOf} />
        )}
      </section>

      {active.length > 0 && <LinksPerValue session={session} links={active.map((l) => ({ label: l.label ?? "", link: linkOf(l) }))} />}

      {retired.length > 0 && (
        <section className="flex flex-col gap-2">
          <button type="button" className="w-fit cursor-pointer text-sm text-muted-foreground hover:text-foreground" onClick={() => setShowRetired(!showRetired)}>
            {showRetired ? "▾" : "▸"} Retired links ({retired.length}): the deployed design no longer makes them; they show &quot;This link is no
            longer active&quot;
          </button>
          {showRetired && <LinkTable client={client} links={retired} linkOf={linkOf} />}
        </section>
      )}
    </div>
  );
}

function LinkTable({ client, links, linkOf }: { client: ResearcherApi; links: LinkResponse[]; linkOf: (link: LinkResponse) => string }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            <th className="p-2 font-medium">Label</th>
            <th className="p-2 font-medium">For</th>
            <th className="p-2 font-medium">Link</th>
            <th className="p-2 font-medium">Access</th>
            <th className="p-2 font-medium">Uses</th>
            <th className="p-2 font-medium">Status</th>
            <th className="p-2 font-medium">Created</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {links.map((link) => (
            <LinkRow key={link.id} client={client} link={link} url={linkOf(link)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

type LinkStatus = "open" | "used up" | "revoked" | "retired";

function statusOf(link: LinkResponse): LinkStatus {
  if (link.retiredAt) return "retired";
  if (link.revokedAt) return "revoked";
  if (link.maxUses !== undefined && link.uses >= link.maxUses) return "used up";
  return "open";
}

const STATUS_STYLE: Record<LinkStatus, string> = {
  open: "bg-primary/15 text-primary",
  "used up": "bg-muted text-muted-foreground",
  revoked: "bg-destructive/10 text-destructive",
  retired: "bg-muted text-muted-foreground",
};

/** Who may use a link, in a few words (sign-in is the study's setting). */
function accessOf(link: LinkResponse): string {
  return link.participantId ? `participant ${link.participantId}` : "anyone";
}

function LinkRow({ client, link, url }: { client: ResearcherApi; link: LinkResponse; url: string }) {
  const revoke = useRevokeLinkMutation(client);
  const renew = useRenewLinkSecretMutation(client);
  const [editing, setEditing] = useState(false);
  const status = statusOf(link);
  const values = Object.entries(link.params);
  const error = revoke.error ?? renew.error;

  return (
    <>
      <tr className="border-b align-top last:border-0">
        <td className="p-2 font-medium">{link.label}</td>
        <td className="p-2">
          {values.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {values.map(([k, v]) => (
                <span key={k} className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px]">
                  {k === "coder" ? (
                    <>
                      coder <strong className="font-mono">{v}</strong>
                    </>
                  ) : (
                    <>
                      {k}: <strong className="font-mono">{v}</strong>
                    </>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">everyone</span>
          )}
        </td>
        <td className="p-2">
          <CopyLink link={url} disabled={status === "revoked" || status === "retired"} />
        </td>
        <td className="p-2 text-xs text-muted-foreground">{accessOf(link)}</td>
        <td className="p-2 tabular-nums">
          {link.uses}
          {link.maxUses !== undefined && <span className="text-muted-foreground"> / {link.maxUses}</span>}
        </td>
        <td className="p-2">
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[status]}`}>{status}</span>
        </td>
        <td className="p-2 whitespace-nowrap text-muted-foreground">{formatWhen(link.created)}</td>
        <td className="p-2">
          <div className="flex justify-end gap-1">
            <IconButton icon={Pencil} iconClassName="h-3.5 w-3.5" label="Who may use this link" onClick={() => setEditing(!editing)} />
            <IconButton
              icon={KeyRound}
              iconClassName="h-3.5 w-3.5"
              label="New link (the old one stops working; coders who started keep working)"
              disabled={renew.isPending || status === "retired"}
              onClick={() => confirm(`Make a new link for "${link.label}"? The current link stops working.`) && renew.mutate(link.id)}
            />
            {status !== "revoked" && status !== "retired" && (
              <IconButton
                icon={Ban}
                iconClassName="h-3.5 w-3.5"
                label="Revoke: stop new coders from joining with this link"
                className="hover:text-destructive"
                disabled={revoke.isPending}
                onClick={() =>
                  confirm(`Revoke "${link.label}"? New coders can't join with it; started coders keep working.`) && revoke.mutate(link.id)
                }
              />
            )}
          </div>
          {error && <p className="mt-1 text-xs text-destructive">{error.message}</p>}
        </td>
      </tr>
      {editing && (
        <tr className="border-b bg-muted/30">
          <td colSpan={8} className="p-3">
            <AccessForm client={client} link={link} onDone={() => setEditing(false)} />
          </td>
        </tr>
      )}
    </>
  );
}

/** A link's settings: label, max uses, a fixed participant id. */
function AccessForm({ client, link, onDone }: { client: ResearcherApi; link: LinkResponse; onDone: () => void }) {
  const update = useUpdateLinkMutation(client);
  const [label, setLabel] = useState(link.label);
  const [maxUses, setMaxUses] = useState(link.maxUses === undefined ? "" : String(link.maxUses));
  const [participantId, setParticipantId] = useState(link.participantId ?? "");

  async function save() {
    await update.mutateAsync({
      id: link.id,
      body: {
        label,
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
        <Input aria-label="Max uses" type="number" min={1} className="w-32" placeholder="Max uses" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
        <Input
          aria-label="Fixed participant id"
          className="w-48"
          placeholder="Fixed participant id"
          value={participantId}
          onChange={(e) => setParticipantId(e.target.value)}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Whether coders sign in is a setting of the study. Without sign-in, work stays on the device it was started on; coders can move
        it with &quot;Continue on another device&quot;. Signed in, coders continue on any device by signing in there. A participant id is a label, never a way back into a session.{" "}
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

/**
 * URL parameters with known values (a list): a link per
 * value, built here from the links (nothing is stored), e.g. to hand each
 * school or panel its own (docs/architecture.md §7). Other URL
 * parameters keep their placeholders.
 */
function LinksPerValue({
  session,
  links,
}: {
  session: SessionItem | null;
  links: { label: string; link: string }[];
}) {
  const [param, setParam] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const params = (session?.params ?? []).filter((p) => p.kind === "url" && !("open" in p.values));
  if (params.length === 0) return null;
  const valuesOf = (p: SessionParam): string[] => ("list" in p.values ? p.values.list.map((v) => String(v.value)) : []);
  const chosen = params.find((p) => p.name === param) ?? null;
  const rows = chosen
    ? links.flatMap(({ label, link }) =>
        valuesOf(chosen).map((value) => {
          const key = sessionParamKey(chosen);
          const placeholder = `${key}=<${chosen.name}>`;
          const filled = `${key}=${encodeURIComponent(value)}`;
          return { label, value, link: link.includes(placeholder) ? link.replace(placeholder, filled) : `${link}${link.includes("?") ? "&" : "?"}${filled}` };
        }),
      )
    : [];
  const text = rows.map((r) => [r.label, r.value, r.link].join("\t")).join("\n");
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">A link per value of a URL parameter</h3>
      <p className="text-xs text-muted-foreground">
        For a URL parameter with known values, list a link per value, e.g. one per school to send around. Nothing is stored: these are
        the links above with the value filled in.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {params.map((p) => (
          <Button key={p.name} type="button" size="sm" variant={param === p.name ? "default" : "outline"} onClick={() => setParam(param === p.name ? null : p.name)}>
            {p.name}
          </Button>
        ))}
        {rows.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied" : `Copy all ${rows.length} (tab separated)`}
          </Button>
        )}
      </div>
      {rows.length > 0 && (
        <table className="w-full text-left text-xs">
          <tbody>
            {rows.slice(0, 200).map((r) => (
              <tr key={r.link} className="border-t border-border">
                {links.length > 1 && <td className="py-1 pr-2">{r.label}</td>}
                <td className="py-1 pr-2 font-mono">{r.value}</td>
                <td className="break-all py-1 font-mono text-muted-foreground">{r.link}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
