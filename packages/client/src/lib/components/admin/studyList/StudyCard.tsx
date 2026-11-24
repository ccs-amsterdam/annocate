import type { StudyResponse } from "@annotinder/contracts";
import { Archive, Calendar, Trash2 } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";

const created = (study: StudyResponse) =>
  study.created
    ? new Date(study.created).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "Recently";

/** A study in the list: its name, when it was made, archived or not; opens it, with a delete button on hover. */
export function StudyCard({
  study,
  onOpen,
  onDelete,
}: {
  study: StudyResponse;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Open ${study.name}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className="group relative flex cursor-pointer flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-wood/50 hover:bg-wood/5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-base font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">
          {study.name}
        </h3>
        <IconButton
          icon={Trash2}
          label={`Delete study ${study.name}`}
          className="-mt-1 -mr-2 h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100"
          iconClassName="h-3.5 w-3.5"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        />
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Calendar className="h-3.5 w-3.5" />
        <span>{created(study)}</span>
        {study.archived && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium">
            <Archive className="h-3 w-3" /> Archived
          </span>
        )}
      </div>
    </div>
  );
}
