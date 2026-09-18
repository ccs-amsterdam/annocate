import { useMemo } from "react";
import { HttpJobServer } from "../api/httpJobServer";
import { useJobManager } from "../jobManager/useJobManager";
import { SpanAnnotationProvider } from "../context/SpanAnnotationContext";
import { Question } from "./Question";
import { UnitFields } from "./UnitFields";

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
  if (snapshot.phase === "error") {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-3 p-8">
        <p className="text-red-600">Something went wrong: {snapshot.error}</p>
        <button
          type="button"
          className="w-fit rounded border px-3 py-1 hover:bg-muted"
          onClick={() => manager.retry()}
        >
          Retry
        </button>
      </div>
    );
  }
  if (snapshot.phase === "finished") return <p>You&apos;re done. Thanks for annotating!</p>;

  if (!snapshot.currentItem || (snapshot.currentItem.type !== "user_variable" && snapshot.currentItem.type !== "unit_variable")) {
    return <p>Unexpected state.</p>;
  }

  const item = snapshot.currentItem;
  const spanVariable = item.type === "unit_variable" && item.variable.type === "span" ? item.variable : null;

  const body = (
    <>
      {snapshot.currentUnit && snapshot.currentUnitLayout && (
        <UnitFields layout={snapshot.currentUnitLayout} data={snapshot.currentUnit.data} />
      )}
      <Question
        item={item}
        onAnswer={(value, conditionValue) => manager.answer(value, conditionValue)}
        unitVariables={snapshot.currentUnitVariables ?? undefined}
      />
    </>
  );

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      {spanVariable ? (
        // Keyed by item.name so span state resets whenever the coder moves
        // to a different span question (design plan §11b). Seeds
        // `initialSpans` from any already-stored (not-yet-`done`) answer for
        // this variable, so resuming a partially-answered unit doesn't lose
        // previously-drawn spans (design plan §4.3 span-polish).
        <SpanAnnotationProvider
          key={item.name}
          column={spanVariable.column}
          codes={spanVariable.codes}
          initialSpans={snapshot.currentUnitVariables?.[item.name]?.spans}
        >
          {body}
        </SpanAnnotationProvider>
      ) : (
        body
      )}
    </div>
  );
}

