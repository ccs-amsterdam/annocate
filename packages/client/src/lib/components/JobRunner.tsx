import { useMemo } from "react";
import { HttpJobServer } from "../api/httpJobServer";
import { useJobManager } from "../jobManager/useJobManager";
import { SpanAnnotationProvider } from "../context/SpanAnnotationContext";
import { Question } from "./Question";
import { UnitFields } from "./UnitFields";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

export interface JobRunnerProps {
  baseUrl: string;
  coderKey: string;
  inviteSecret?: string;
  onFinished?: () => void;
}

/**
 * Top-level component that boots a coder session against a job server and
 * renders the current step (design plan §5's JobManager, Phase 3.4's
 * end-to-end flow).
 *
 * Implements a mobile-first responsive 2-pane layout:
 * - Top pane: scrollable unit content/document
 * - Bottom pane: docked, thumb-friendly question & answer options
 */
export function JobRunner({ baseUrl, coderKey, inviteSecret, onFinished }: JobRunnerProps) {
  const jobServer = useMemo(
    () => new HttpJobServer({ baseUrl, coderKey, inviteSecret }),
    [baseUrl, coderKey, inviteSecret],
  );
  const { manager, snapshot } = useJobManager(jobServer);

  if (snapshot.phase === "loading") {
    return (
      <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground">Loading session...</p>
      </div>
    );
  }

  if (snapshot.phase === "error") {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center p-6">
        <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-destructive/20 bg-card p-6 text-center shadow-lg">
          <div className="rounded-full bg-destructive/10 p-3 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h3 className="mt-3 text-lg font-semibold text-foreground">Something went wrong</h3>
          <p className="mt-1 text-sm text-muted-foreground">{snapshot.error}</p>
          <Button
            type="button"
            className="mt-5"
            onClick={() => manager.retry()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (snapshot.phase === "finished") {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center p-6">
        <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-border bg-card p-8 text-center shadow-lg">
          <div className="rounded-full bg-primary/10 p-4 text-primary">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <h2 className="mt-4 text-xl font-bold tracking-tight text-foreground">Job Complete!</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            You&apos;ve completed all available units. Thank you for your contributions!
          </p>
          {onFinished && (
            <Button onClick={onFinished} className="mt-6">
              Done
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!snapshot.currentItem || (snapshot.currentItem.type !== "user_variable" && snapshot.currentItem.type !== "unit_variable")) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Unexpected session state.</p>
      </div>
    );
  }

  const item = snapshot.currentItem;
  const spanVariable = item.type === "unit_variable" && item.variable.type === "span" ? item.variable : null;
  const hasUnitLayout = Boolean(snapshot.currentUnit && snapshot.currentUnitLayout);

  const questionElement = (
    <Question
      key={item.name}
      item={item}
      onAnswer={(value, conditionValue) => manager.answer(value, conditionValue)}
      unitVariables={snapshot.currentUnitVariables ?? undefined}
    />
  );

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background">
      {/* Top App Header / Navigation Bar */}
      <header className="z-20 flex h-12 shrink-0 items-center justify-between border-b border-border bg-primary px-4 text-primary-foreground shadow-sm">
        <div className="flex items-center gap-2">
          <span className="font-bold tracking-tight text-sm">Annotinder</span>
          {snapshot.currentUnit?.externalId && (
            <span className="rounded bg-primary-foreground/20 px-1.5 py-0.5 text-xs font-mono">
              {snapshot.currentUnit.externalId}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs font-medium text-primary-foreground/80">
          <span>{item.name}</span>
        </div>
      </header>

      {/* Main Content Area: Responsive Split View */}
      {hasUnitLayout ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Scrollable Unit Content (Document) */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="mx-auto max-w-2xl">
              {spanVariable ? (
                <SpanAnnotationProvider
                  key={item.name}
                  column={spanVariable.column}
                  codes={spanVariable.codes}
                  initialSpans={snapshot.currentUnitVariables?.[item.name]?.spans}
                >
                  <UnitFields layout={snapshot.currentUnitLayout!} data={snapshot.currentUnit!.data} />
                </SpanAnnotationProvider>
              ) : (
                <UnitFields layout={snapshot.currentUnitLayout!} data={snapshot.currentUnit!.data} />
              )}
            </div>
          </div>

          {/* Docked Thumb-Friendly Bottom Question Card */}
          <div className="z-10 shrink-0 border-t border-border bg-card/95 p-4 shadow-lg backdrop-blur">
            <div className="mx-auto max-w-xl">
              {questionElement}
            </div>
          </div>
        </div>
      ) : (
        /* Standalone Question (intro, survey, user variable without document) */
        <div className="flex flex-1 items-center justify-center overflow-y-auto p-4 sm:p-8">
          <div className="w-full max-w-xl">
            {questionElement}
          </div>
        </div>
      )}
    </div>
  );
}
