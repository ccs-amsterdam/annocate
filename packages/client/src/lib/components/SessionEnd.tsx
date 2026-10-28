import { useEffect, useState } from "react";
import { CheckCircle2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Reopen } from "@annotinder/contracts";
import type { SessionEnding } from "../jobManager/JobManager";
import { TemplateMarkdown } from "./TemplateMarkdown";
import { QuitDialog } from "./QuitMenu";

/** Seconds before an ending's redirect happens on its own. */
const REDIRECT_DELAY = 3;

interface SessionEndProps {
  /** The `end` item the session ended at; null when the coder simply finished the job. */
  ending: SessionEnding | null;
  /** The coder quit (instead of finishing or reaching an `end` item). */
  quit?: boolean;
  /** The coder asked for their answers to be deleted. */
  deletionRequested?: boolean;
  /** Asks for deletion after the session ended; without it the option isn't offered. */
  onRequestDeletion?: () => Promise<void>;
  /** Whether the coder can still go back to their answers (after finishing). */
  reopen?: Reopen;
  onReopen?: () => Promise<void>;
  /** In a preview, the redirect is shown but not followed. */
  preview?: boolean;
  onFinished?: () => void;
}

/**
 * The last screen: done, quit, or ended by an `end` item (screened out or
 * complete) with its message and redirect. Coders can still ask for their
 * answers to be deleted here, and go back for a few minutes after finishing
 * (`reopen`; afterwards the session is closed, docs/coder-identity.md §9).
 */
export function SessionEnd({ ending, quit = false, deletionRequested = false, onRequestDeletion, reopen = null, onReopen, preview, onFinished }: SessionEndProps) {
  const redirect = ending?.redirectUrl ?? null;
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!redirect || preview) return;
    const timer = window.setTimeout(() => window.location.assign(redirect), REDIRECT_DELAY * 1000);
    return () => window.clearTimeout(timer);
  }, [redirect, preview]);

  const screenout = ending?.item.outcome === "screenout";
  return (
    <div className="flex h-full min-h-[300px] items-center justify-center p-6">
      <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-border bg-card p-8 text-center shadow-lg">
        <div className="rounded-full bg-primary/10 p-4 text-primary">
          {screenout || quit ? <LogOut className="h-10 w-10" /> : <CheckCircle2 className="h-10 w-10" />}
        </div>
        <h2 className="mt-4 text-xl font-bold tracking-tight text-foreground">
          {quit ? "You quit this job" : screenout ? "Thank you" : "Job Complete!"}
        </h2>
        {quit ? (
          <p className="mt-2 text-sm text-muted-foreground">Thank you for your time. You can close this page.</p>
        ) : ending?.message ? (
          <div className="template-markdown mt-2 text-sm text-muted-foreground">
            <TemplateMarkdown rendered={ending.message} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {screenout ? "This is the end of the job for you." : "You've completed all available units. Thank you for your contributions!"}
          </p>
        )}
        {redirect && (
          <Button asChild className="mt-6">
            <a href={redirect}>{preview ? "Redirect (not followed in a preview)" : "Continue"}</a>
          </Button>
        )}
        {!redirect && onFinished && (
          <Button onClick={onFinished} className="mt-6">
            Done
          </Button>
        )}
        {reopen && onReopen && (
          <button
            type="button"
            onClick={() => void onReopen()}
            className="mt-4 cursor-pointer text-sm text-primary underline underline-offset-2 hover:text-primary/80"
          >
            Go back to my answers
            {reopen.until && ` (until ${new Date(reopen.until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`}
          </button>
        )}
        {deletionRequested ? (
          <p className="mt-6 text-xs text-muted-foreground">Your request to delete your answers was sent to the researchers.</p>
        ) : (
          onRequestDeletion &&
          !preview && (
            <button
              type="button"
              onClick={() => setAsking(true)}
              className="mt-6 cursor-pointer text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Ask to delete my answers
            </button>
          )
        )}
        {onRequestDeletion && (
          <QuitDialog choice={asking ? "delete" : null} onClose={() => setAsking(false)} onQuit={() => onRequestDeletion()} />
        )}
      </div>
    </div>
  );
}
