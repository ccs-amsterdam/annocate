import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import type { ServerApi } from "../../../api/serverApi";
import { formatWhen } from "../../../admin/format";
import { useInvalidate } from "./shared";
import { Table, ErrorLine } from "./ui";

// The server admin's Studies and Log tabs: every study (suspend, owner), and the log of admin actions.

export function StudiesTab({ server }: { server: ServerApi }) {
  const studies = useQuery({ queryKey: ["admin", "server", "studies"], queryFn: () => server.listStudies() });
  const invalidate = useInvalidate();
  const update = useMutation({
    mutationFn: (v: { id: number; body: Parameters<ServerApi["updateStudy"]>[1] }) => server.updateStudy(v.id, v.body),
    onSuccess: invalidate,
  });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        What each study holds, not its data. A suspended study takes no coders and can&apos;t be changed; its
        researchers can still read and delete its data.
      </p>
      <ErrorLine error={update.error} />
      <Table head={["Study", "Owner", "Units", "Coders", "Answers", "Created", ""]}>
        {(studies.data ?? []).map((j) => (
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
                  if (
                    j.suspendedAt ||
                    confirm(`Suspend study #${j.id}? Coders are refused, and its researchers can't change it.`)
                  ) {
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

export function LogTab({ server }: { server: ServerApi }) {
  const log = useQuery({ queryKey: ["admin", "server", "log"], queryFn: () => server.listLog() });
  return (
    <Table head={["When", "Admin", "Action", "On", "Details"]}>
      {(log.data ?? []).map((e, i) => (
        <tr key={i} className="border-b align-top last:border-0">
          <td className="p-2 whitespace-nowrap text-muted-foreground">{formatWhen(e.at)}</td>
          <td className="p-2">{e.admin}</td>
          <td className="p-2">{e.action}</td>
          <td className="p-2">{e.target}</td>
          <td className="p-2 font-mono text-[11px] break-all text-muted-foreground">
            {Object.keys(e.details).length ? JSON.stringify(e.details) : ""}
          </td>
        </tr>
      ))}
    </Table>
  );
}
