import { useState } from "react";
import type { AdminClient } from "../../api/httpAdminClient";
import { useCodersQuery, useInviteCoderMutation } from "../../admin/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Coders/progress overview + invite link creation (design plan §5.5). The
 * old app had little equivalent UI to port (see the phase-5 research
 * summary in the design plan) -- this is a fresh, minimal implementation.
 */
export function CodersPanel({ client, baseUrl }: { client: AdminClient; baseUrl: string }) {
  const codersQuery = useCodersQuery(client);
  const inviteCoder = useInviteCoderMutation(client);

  const [label, setLabel] = useState("");
  const [access, setAccess] = useState<"only_authenticated" | "only_anonymous" | "user_decides">("user_decides");
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  async function handleInvite() {
    const invite = await inviteCoder.mutateAsync({ label, access });
    setLastInviteUrl(`${baseUrl}/invite/${invite.secret}`);
    setLabel("");
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
            value={access}
            onChange={(e) => setAccess(e.target.value as typeof access)}
          >
            <option value="user_decides">Anonymous or authenticated</option>
            <option value="only_authenticated">Authenticated only</option>
            <option value="only_anonymous">Anonymous only</option>
          </select>
          <Button onClick={handleInvite} disabled={!label || inviteCoder.isPending}>
            {inviteCoder.isPending ? "Creating..." : "Create"}
          </Button>
        </div>
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
              <th className="p-2">Units done (per unitset)</th>
            </tr>
          </thead>
          <tbody>
            {(codersQuery.data ?? []).map((coder) => (
              <tr key={coder.id} className="border-b last:border-0">
                <td className="p-2">{coder.email ?? `#${coder.id} (anonymous)`}</td>
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
