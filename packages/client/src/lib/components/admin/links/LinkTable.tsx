import type { LinkResponse } from "@annotinder/contracts";
import { Ban, Check, Copy, KeyRound, RotateCcw } from "lucide-react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useRenewLinkSecretMutation, useRevokeLinkMutation, useReopenLinkMutation } from "../../../admin/queries";
import { formatWhen } from "../../../admin/format";
import { IconButton } from "@/components/ui/icon-button";
import { useCopied } from "./useCopied";

/** The links, a row each. */
export function LinkTable({
  client,
  links,
  linkOf,
}: {
  client: ResearcherApi;
  links: LinkResponse[];
  linkOf: (link: LinkResponse) => string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            <th className="p-2 font-medium">Label</th>
            <th className="p-2 font-medium">For</th>
            <th className="p-2 font-medium">Link</th>
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

/** A link: who it is for, its URL, uses (of at most) and status, with renewing, revoking and reopening. */
function LinkRow({ client, link, url }: { client: ResearcherApi; link: LinkResponse; url: string }) {
  const revoke = useRevokeLinkMutation(client);
  const reopen = useReopenLinkMutation(client);
  const renew = useRenewLinkSecretMutation(client);
  const status = statusOf(link);
  // The values the link carries, e.g. its coder (a link per coder)
  const carried = Object.entries(link.params);
  const error = revoke.error ?? reopen.error ?? renew.error;

  return (
    <>
      <tr className="border-b align-top last:border-0">
        <td className="p-2 font-medium">{link.label}</td>
        <td className="p-2">
          {carried.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {carried.map(([k, v]) => (
                <span key={k} className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px]">
                  {k === "group" ? "set" : k} <strong className="font-mono">{v}</strong>
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
            <IconButton
              icon={KeyRound}
              iconClassName="h-3.5 w-3.5"
              label="New link (the old one stops working; coders who started keep working)"
              disabled={renew.isPending || status === "retired"}
              onClick={() =>
                confirm(`Make a new link for "${link.label}"? The current link stops working.`) && renew.mutate(link.id)
              }
            />
            {status !== "revoked" && status !== "retired" && (
              <IconButton
                icon={Ban}
                iconClassName="h-3.5 w-3.5"
                label="Revoke: stop new coders from joining with this link"
                className="hover:text-destructive"
                disabled={revoke.isPending}
                onClick={() =>
                  confirm(`Revoke "${link.label}"? New coders can't join with it; started coders keep working.`) &&
                  revoke.mutate(link.id)
                }
              />
            )}
            {status === "revoked" && (
              <IconButton
                icon={RotateCcw}
                iconClassName="h-3.5 w-3.5"
                label="Reopen: new coders can join with this link again"
                disabled={reopen.isPending}
                onClick={() => reopen.mutate(link.id)}
              />
            )}
          </div>
          {error && <p className="mt-1 text-xs text-destructive">{error.message}</p>}
        </td>
      </tr>
    </>
  );
}

/** Copies a link, and says so for a moment. */
function CopyLink({ link, disabled }: { link: string; disabled: boolean }) {
  const { copied, copy } = useCopied();
  return (
    <button
      type="button"
      disabled={disabled}
      title={link}
      onClick={() => copy(link)}
      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
