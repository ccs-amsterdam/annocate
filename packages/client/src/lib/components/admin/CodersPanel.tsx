import { useState } from "react";
import type { CoderInviteResponse, CoderInviteWrite } from "@annotinder/contracts";
import type { AdminClient } from "../../api/httpAdminClient";
import { useCodersQuery, useInviteCoderMutation } from "../../admin/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Coders/progress overview + invite link creation (docs/client.md §7). The
 * old app had little equivalent UI to port; this is a fresh, minimal
 * implementation.
 */
export function CodersPanel({
  client,
  baseUrl,
  inviteUrl,
}: {
  client: AdminClient;
  baseUrl: string;
  /** Builds the link coders open for an invite (host-app specific). */
  inviteUrl?: (invite: CoderInviteResponse) => string;
}) {
  const codersQuery = useCodersQuery(client);
  const inviteCoder = useInviteCoderMutation(client);

  const [label, setLabel] = useState("");
  const [auth, setAuth] = useState<CoderInviteWrite["auth"]>("none");
  const [participant, setParticipant] = useState<"none" | "fixed" | "url">("none");
  const [participantId, setParticipantId] = useState("");
  const [presets, setPresets] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  async function handleInvite() {
    const invite = await inviteCoder.mutateAsync({
      label,
      auth,
      participantId: participant === "fixed" && participantId ? participantId : undefined,
      participantFromUrl: participant === "url" || undefined,
      variables: parsePresets(presets),
      maxUses: maxUses === "" ? undefined : Number(maxUses),
    });
    const url = inviteUrl ? inviteUrl(invite) : `${baseUrl}/invite/${invite.secret}`;
    setLastInviteUrl(participant === "url" ? `${url}&participant=<id>` : url);
    setLabel("");
    setPresets("");
    setMaxUses("");
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Coders</h2>

      <div className="flex flex-col gap-2 rounded border p-3">
        <label className="text-sm font-medium">Create invite link</label>
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
          <Button onClick={handleInvite} disabled={!label || inviteCoder.isPending}>
            {inviteCoder.isPending ? "Creating..." : "Create"}
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
        </div>
        <p className="text-[11px] text-muted-foreground">
          Presets set the codebook&apos;s auto variables with source &quot;Set by invitation&quot; for everyone using
          this link. Use one link per coder (e.g. with a fixed participant id) to give specific coders specific
          unitsets. Without login, work stays on the device it was started on; coders can move it with
          &quot;Continue on another device&quot;. A participant id is a label, never a way back into a session.
        </p>
        {lastInviteUrl && (
          <p className="break-all text-sm">
            Invite link: <code className="rounded bg-muted px-1">{lastInviteUrl}</code>
          </p>
        )}
        {inviteCoder.isError && <p className="text-sm text-destructive">{inviteCoder.error.message}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Progress ({codersQuery.data?.length ?? 0} coder(s))</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="p-2">Coder</th>
              <th className="p-2">Participant</th>
              <th className="p-2">Units done (per unitset)</th>
            </tr>
          </thead>
          <tbody>
            {(codersQuery.data ?? []).map((coder) => (
              <tr key={coder.id} className="border-b last:border-0">
                <td className="p-2">{coder.email ?? `#${coder.id} (anonymous)`}</td>
                <td className="p-2">{coder.participantId ?? "-"}</td>
                <td className="p-2">
                  {Object.entries(coder.unitsDone)
                    .map(([set, n]) => `${set}: ${n}`)
                    .join(", ") || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
