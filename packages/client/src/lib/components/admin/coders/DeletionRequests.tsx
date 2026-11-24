import type { CoderProgress } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { formatWhen } from "../../../admin/format";
import { HelpButton } from "../../../help/HelpButton";
import { coderName } from "./coderName";

/**
 * Coders who ask to delete their answers: delete now, or later (then the
 * request leaves this list and stays marked on the coder's row; how many are
 * so is said below it).
 */
export function DeletionRequests({
  coders,
  postponing,
  onDelete,
  onPostpone,
}: {
  coders: CoderProgress[];
  /** A "later" is being saved. */
  postponing: boolean;
  onDelete: (coder: CoderProgress) => void;
  onPostpone: (coder: CoderProgress) => void;
}) {
  const requests = coders.filter((c) => c.deletionRequest && !c.deletionRequest.postponedAt);
  const postponed = coders.filter((c) => c.deletionRequest?.postponedAt).length;
  return (
    <>
      {requests.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            {requests.length === 1 ? "A coder asks" : `${requests.length} coders ask`} to delete their answers
            <HelpButton topic="coders-and-progress#deleting-a-coders-data" label="Help: deleting a coder's data" />
          </h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {requests.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{coderName(c)}</span>
                <span className="text-xs text-muted-foreground">
                  asked {formatWhen(c.deletionRequest!.at)} · {c.answers} answers
                  {c.linkLabel ? ` · ${c.linkLabel}` : ""}
                </span>
                <span className="ml-auto flex gap-1">
                  <Button size="xs" variant="destructive" onClick={() => onDelete(c)}>
                    Delete now
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={postponing}
                    title="Stop showing this request here. It stays marked on the coder's row until you delete their data."
                    onClick={() => onPostpone(c)}
                  >
                    Delete later
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {postponed > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {postponed === 1 ? "1 coder's" : `${postponed} coders'`} data still to be deleted (marked &ldquo;deletion
          requested&rdquo; below).
        </p>
      )}
    </>
  );
}
