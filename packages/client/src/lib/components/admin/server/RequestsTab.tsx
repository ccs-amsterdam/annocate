import { useMutation, useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ServerApi } from "../../../api/serverApi";
import { formatWhen } from "../../../admin/format";
import { useInvalidate } from "./shared";
import { ErrorLine } from "./ui";

// The server admin's Requests page: users asking to become a researcher.

export function RequestsTab({ server }: { server: ServerApi }) {
  const requests = useQuery({ queryKey: ["admin", "server", "requests"], queryFn: () => server.listRequests() });
  const invalidate = useInvalidate();
  const decide = useMutation({
    mutationFn: (v: { userId: number; approve: boolean }) => server.decideRequest(v.userId, v.approve),
    onSuccess: invalidate,
  });
  if ((requests.data ?? []).length === 0)
    return <p className="text-sm text-muted-foreground">No open requests to become a researcher.</p>;
  return (
    <div className="flex flex-col gap-2">
      <ErrorLine error={decide.error} />
      {requests.data!.map((r) => (
        <div key={r.userId} className="flex flex-wrap items-start gap-3 rounded-lg border p-3">
          <div className="min-w-0 flex-1">
            <div className="font-medium">{r.email}</div>
            <div className="text-xs text-muted-foreground">asked {formatWhen(r.at)}</div>
            {r.message && <p className="mt-1 text-sm whitespace-pre-wrap">{r.message}</p>}
          </div>
          <Button size="sm" onClick={() => decide.mutate({ userId: r.userId, approve: true })}>
            <Check className="h-3.5 w-3.5" /> Make researcher
          </Button>
          <Button size="sm" variant="outline" onClick={() => decide.mutate({ userId: r.userId, approve: false })}>
            Deny
          </Button>
        </div>
      ))}
    </div>
  );
}
