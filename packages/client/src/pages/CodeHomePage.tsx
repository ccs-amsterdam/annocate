import { Link } from "@tanstack/react-router";
import { Link2 } from "lucide-react";

/**
 * The annotator section's home (`/code`): the studies this device (or the
 * logged-in coder) takes part in, and how to start one.
 */
export function CodeHomePage({ dev = false }: { dev?: boolean }) {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <h1 className="font-heading text-2xl font-bold tracking-tight">Annotate</h1>
      <div className="mt-6 rounded-xl border border-dashed border-border bg-card p-6 text-center">
        <Link2 className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 font-medium">Start from a link</p>
        <p className="mt-1 text-sm text-muted-foreground">
          You take part in a study through the link its researcher gave you. Open that link to begin; studies you started on this device show up here.
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
