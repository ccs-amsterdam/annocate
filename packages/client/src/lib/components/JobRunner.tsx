import { useMemo } from "react";
import { HttpJobServer } from "../api/httpJobServer";
import { useJobManager } from "../jobManager/useJobManager";
import { Question } from "./Question";

export interface JobRunnerProps {
  baseUrl: string;
  coderKey: string;
  inviteSecret?: string;
}

/**
 * Top-level component that boots a coder session against a job server and
 * renders the current step (design plan §5's JobManager, Phase 3.4's
 * end-to-end flow). This is the minimal MVP UI; Phase 4 replaces `Question`
 * with the full ported annotation interface.
 */
export function JobRunner({ baseUrl, coderKey, inviteSecret }: JobRunnerProps) {
  const jobServer = useMemo(
    () => new HttpJobServer({ baseUrl, coderKey, inviteSecret }),
    [baseUrl, coderKey, inviteSecret],
  );
  const { manager, snapshot } = useJobManager(jobServer);

  if (snapshot.phase === "loading") return <p>Loading...</p>;
  if (snapshot.phase === "error") return <p className="text-red-600">Error: {snapshot.error}</p>;
  if (snapshot.phase === "finished") return <p>You&apos;re done. Thanks for annotating!</p>;

  if (!snapshot.currentItem || (snapshot.currentItem.type !== "user_variable" && snapshot.currentItem.type !== "unit_variable")) {
    return <p>Unexpected state.</p>;
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      {snapshot.currentUnit && (
        <pre className="rounded bg-gray-100 p-4 text-sm">{JSON.stringify(snapshot.currentUnit.data, null, 2)}</pre>
      )}
      <Question item={snapshot.currentItem} onAnswer={(value, conditionValue) => manager.answer(value, conditionValue)} />
    </div>
  );
}
