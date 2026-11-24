import { CloudOff } from "lucide-react";

// What the coding screen shows while saving waits for the connection
// (`snapshot.retrying`, docs/client.md §2 "Saving in the background").

/** What isn't saved yet, by the number of finished units among it. */
function unsavedText(unsavedUnits: number): string {
  if (unsavedUnits === 0) return "Not saved yet: no connection";
  return `${unsavedUnits} ${unsavedUnits === 1 ? "unit" : "units"} not saved yet: no connection`;
}

/** The top bar's notice: how many finished units wait to be saved. */
export function UnsavedNotice({ unsavedUnits }: { unsavedUnits: number }) {
  return (
    <span
      className="flex items-center gap-1 text-xs"
      role="status"
      title="Your answers are kept and saved as soon as the connection is back."
    >
      <CloudOff className="h-4 w-4" />
      <span className="hidden sm:inline">{unsavedText(unsavedUnits)}</span>
    </span>
  );
}

/**
 * Under the top bar: the session waits for the connection. The coder can go
 * on answering, but the end of the study (and an experiment's condition)
 * comes only once everything is saved: this says why nothing happens there.
 */
export function WaitingForConnection() {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-border bg-amber-500/10 px-4 py-1.5 text-center text-sm text-foreground"
    >
      <CloudOff className="h-4 w-4 shrink-0" aria-hidden />
      <span>
        Waiting for the connection… Your answers are kept, and saved as soon as it is back. The study ends only once
        they are saved.
      </span>
    </div>
  );
}
