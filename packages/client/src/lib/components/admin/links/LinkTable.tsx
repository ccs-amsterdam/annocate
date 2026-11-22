import { useState } from "react";
import type { LinkResponse } from "@annotinder/contracts";
import { Ban, Check, Copy, KeyRound, Pencil, RotateCcw } from "lucide-react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import {
  useRenewLinkSecretMutation,
  useRevokeLinkMutation,
  useReopenLinkMutation,
  useUpdateLinkMutation,
} from "../../../admin/queries";
import { formatWhen } from "../../../admin/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";
import { HelpButton } from "../../../help/HelpButton";
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

/** Who may use a link, in a few words (sign-in is the invitation's). */
function accessOf(link: LinkResponse): string {
  return link.coder ? `coder ${link.coder}` : "anyone";
}

/** A link: who it is for, its URL, uses and status, with editing, renewing, revoking and reopening. */
function LinkRow({ client, link, url }: { client: ResearcherApi; link: LinkResponse; url: string }) {
  const revoke = useRevokeLinkMutation(client);
  const reopen = useReopenLinkMutation(client);
  const renew = useRenewLinkSecretMutation(client);
  const [editing, setEditing] = useState(false);
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
            <IconButton
              icon={Pencil}
              iconClassName="h-3.5 w-3.5"
              label="Who may use this link"
              onClick={() => setEditing(!editing)}
            />
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

/** A link's settings: label, max uses, a fixed coder id. */
function AccessForm({ client, link, onDone }: { client: ResearcherApi; link: LinkResponse; onDone: () => void }) {
  const update = useUpdateLinkMutation(client);
  const [label, setLabel] = useState(link.label);
  const [maxUses, setMaxUses] = useState(link.maxUses === undefined ? "" : String(link.maxUses));
  const [coderId, setCoderId] = useState(link.coder ?? "");

  async function save() {
    await update.mutateAsync({
      id: link.id,
      body: {
        label,
        maxUses: maxUses === "" ? undefined : Number(maxUses),
        coder: coderId.trim() || undefined,
      },
    });
    onDone();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Label"
          className="w-64"
          placeholder="Label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Input
          aria-label="Max uses"
          type="number"
          min={1}
          className="w-32"
          placeholder="Max uses"
          value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
        />
        <Input
          aria-label="Fixed coder id"
          className="w-48"
          placeholder="Fixed coder id"
          value={coderId}
          onChange={(e) => setCoderId(e.target.value)}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Whether coders must sign in is part of the coder unit assignment (in the editor). Coders who don&apos;t sign in
        continue on the device they started on, or move with &quot;Continue on another device&quot;; signed in, they
        continue on any device by signing in there. A coder id is a label, never a way back into a session.{" "}
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
