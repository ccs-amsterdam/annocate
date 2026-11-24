import { Sparkles, X } from "lucide-react";

/** The study's message that the coder got new units since they were last here, until dismissed. */
export function NewUnitsBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-border bg-primary/10 px-4 py-1.5 text-sm text-foreground"
    >
      <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span>{message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
