import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CircleCheck, Link2, Loader2 } from "lucide-react";
import { continueUrl, loadStudies, type StudyEntry } from "../lib/session/studies";

const ENDED: Record<string, string> = { complete: "Finished", screenout: "Ended", quit: "Stopped" };

function when(date: Date): string {
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

/**
 * The annotator section's home (`/code`): the studies this browser (or the
 * logged-in coder, on any device) takes part in, to continue them; and how
 * to start one: from the link a researcher gives you.
 */
export function CodeHomePage({ apiUrl, dev = false }: { apiUrl: string; dev?: boolean }) {
  const [studies, setStudies] = useState<StudyEntry[] | null>(null);
  useEffect(() => {
    let live = true;
    void loadStudies(apiUrl).then((s) => live && setStudies(s));
    return () => {
      live = false;
    };
  }, [apiUrl]);

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <h1 className="font-heading text-2xl font-bold tracking-tight">Annotate</h1>
      {studies === null ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Looking for your studies…
        </p>
      ) : (
        studies.length > 0 && (
          <section className="mt-6" aria-label="Your studies">
            <h2 className="text-sm font-semibold text-muted-foreground">Your studies</h2>
            <ul className="mt-2 flex flex-col gap-2">
              {studies.map((entry) => (
                <li key={continueUrl(entry)}>
                  <StudyCard entry={entry} />
                </li>
              ))}
            </ul>
          </section>
        )
      )}
      <div className="mt-6 rounded-xl border border-dashed border-border bg-card p-6 text-center">
        <Link2 className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 font-medium">Start from a link</p>
        <p className="mt-1 text-sm text-muted-foreground">
          You take part in a study through the link its researcher gave you. Open that link to begin; the studies you started in this browser show up
          here.
        </p>
      </div>
      {dev && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Development server:{" "}
          <Link to="/code/$deployment" params={{ deployment: "1" }} search={{ link: "demo-secret" }} className="underline">
            try the demo job
          </Link>
        </p>
      )}
    </main>
  );
}

function StudyCard({ entry }: { entry: StudyEntry }) {
  const { study } = entry;
  const ended = study.ended ? ENDED[study.ended] : null;
  return (
    <a
      href={continueUrl(entry)}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{study.title ?? "Untitled study"}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {study.units > 0 ? `${study.units} unit${study.units === 1 ? "" : "s"} done · ` : ""}
          last active {when(study.lastActive)}
          {entry.elsewhere ? " · on another device" : ""}
        </p>
      </div>
      {ended ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          <CircleCheck className="h-3.5 w-3.5" />
          {ended}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
          Continue
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      )}
    </a>
  );
}
