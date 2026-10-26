import { useEffect } from "react";
import { CheckCircle2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SessionEnding } from "../jobManager/JobManager";
import { TemplateMarkdown } from "./TemplateMarkdown";

/** Seconds before an ending's redirect happens on its own. */
const REDIRECT_DELAY = 3;

interface SessionEndProps {
  /** The `end` item the session ended at; null when the coder simply finished the job. */
  ending: SessionEnding | null;
  /** In a preview, the redirect is shown but not followed. */
  preview?: boolean;
  onFinished?: () => void;
}

/** The last screen: done, or ended by an `end` item (screened out or complete) with its message and redirect. */
export function SessionEnd({ ending, preview, onFinished }: SessionEndProps) {
  const redirect = ending?.redirectUrl ?? null;

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
          {screenout ? <LogOut className="h-10 w-10" /> : <CheckCircle2 className="h-10 w-10" />}
        </div>
        <h2 className="mt-4 text-xl font-bold tracking-tight text-foreground">{screenout ? "Thank you" : "Job Complete!"}</h2>
        {ending?.message ? (
          <div className="mt-2 text-sm text-muted-foreground">
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
      </div>
    </div>
  );
}
