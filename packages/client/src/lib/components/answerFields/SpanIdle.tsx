import { List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COMMAND_BADGES } from "../../keyboard/commands";
import { ShortcutBadge } from "../ShortcutBadge";

/** Nothing selected: how many spans are labelled, the way to their list, and Done. */
export function SpanIdle({
  count,
  onViewList,
  onDone,
}: {
  /** The unit's labelled spans. */
  count: number;
  onViewList: () => void;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 py-0.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Click or select words above to label spans, or use the arrow keys and Space.
        </p>
        <span className="font-mono text-xs font-medium text-muted-foreground">{count} labeled</span>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 cursor-pointer gap-1.5 px-3 text-xs"
          disabled={count === 0}
          onClick={onViewList}
          title={count > 0 ? "View and edit all labeled spans" : "No spans labeled yet"}
        >
          <List className="h-3.5 w-3.5" />
          <span>View labeled spans ({count})</span>
        </Button>

        <Button
          size="sm"
          className="relative h-8 cursor-pointer px-4 text-xs font-medium"
          data-key-target=""
          onClick={onDone}
        >
          Done ({count})
          <ShortcutBadge shortcut={COMMAND_BADGES.continue} />
        </Button>
      </div>
    </div>
  );
}
