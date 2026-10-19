import type { CoderProgress } from "@annotinder/contracts";
import type { AdminClient } from "../../api/httpAdminClient";
import { useCodersQuery } from "../../admin/queries";
import { formatWhen } from "../../admin/format";

/**
 * Coder progress (docs/plan-job-admin.md): who started, through which
 * invitation, when they were last active, and how many units they finished
 * per loop of the live codebook. Invitations are on their own tab.
 */
export function CodersPanel({ client }: { client: AdminClient }) {
  const codersQuery = useCodersQuery(client);
  const coders = sortByActivity(codersQuery.data ?? []);
  // Loops of the live codebook (every coder has the same keys)
  const loops = Object.keys(coders[0]?.finished ?? {});

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-medium">Coders</h2>
      <p className="text-xs text-muted-foreground">
        Finished units count, per loop of the live codebook, the units where a coder answered every question of the
        loop.
      </p>

      {codersQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading coders...</p>
      ) : coders.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No coders yet. Coders appear here once they open an invitation link.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="p-2 font-medium">Coder</th>
                <th className="p-2 font-medium">Invitation</th>
                <th className="p-2 font-medium">Started</th>
                <th className="p-2 font-medium">Last active</th>
                <th className="p-2 text-right font-medium">Answers</th>
                {loops.map((loop) => (
                  <th key={loop} className="p-2 text-right font-medium">
                    Finished in <span className="font-mono">{loop}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coders.map((coder) => (
                <tr key={coder.id} className="border-b last:border-0">
                  <td className="p-2">
                    {coder.participantId ?? coder.email ?? <span className="text-muted-foreground">#{coder.id}</span>}
                  </td>
                  <td className="p-2 text-muted-foreground">{coder.inviteLabel ?? "–"}</td>
                  <td className="p-2 whitespace-nowrap text-muted-foreground">{formatWhen(coder.started)}</td>
                  <td className="p-2 whitespace-nowrap">{formatWhen(coder.lastActive)}</td>
                  <td className="p-2 text-right tabular-nums">{coder.answers}</td>
                  {loops.map((loop) => (
                    <td key={loop} className="p-2 text-right tabular-nums">
                      {coder.finished[loop] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Most recently active first; coders who never answered last, newest first. */
function sortByActivity(coders: CoderProgress[]): CoderProgress[] {
  const time = (d: Date | null) => (d ? new Date(d).getTime() : 0);
  return [...coders].sort(
    (a, b) => time(b.lastActive) - time(a.lastActive) || time(b.started) - time(a.started) || b.id - a.id,
  );
}
