import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Which units of the table are shown, with the previous and next page; nothing when all fit on one page. */
export function Pager({
  offset,
  total,
  pageSize,
  onOffsetChange,
}: {
  offset: number;
  total: number;
  pageSize: number;
  onOffsetChange: (offset: number) => void;
}) {
  if (total <= pageSize) return null;
  return (
    <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
      {offset + 1}–{Math.min(offset + pageSize, total)} of {total}
      <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => onOffsetChange(offset - pageSize)}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={offset + pageSize >= total}
        onClick={() => onOffsetChange(offset + pageSize)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
