import { useState } from "react";
import type { SpanAnswer } from "@annotinder/contracts";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SpanAnnotationState } from "../../context/spanAnnotation";
import { SpanEditLabel } from "./SpanEditLabel";
import { SpanListRow } from "./SpanListRow";

/** All the unit's spans, to edit one: the list, or the span opened from it. */
export function SpanList({
  annotation,
  isDark,
  onClose,
}: {
  annotation: SpanAnnotationState;
  isDark: boolean;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<SpanAnswer | null>(null);
  const edit = (span: SpanAnswer) => {
    setEditing(span);
    annotation.setFocusedSpanId(span.id);
  };
  /** Back from editing a span to the list. */
  const closeEditor = () => {
    setEditing(null);
    annotation.setFocusedSpanId(null);
  };

  return (
    <div className="flex animate-in flex-col gap-2.5 fade-in slide-in-from-bottom-1">
      {editing ? (
        <SpanEditLabel
          annotation={annotation}
          span={editing}
          onBack={closeEditor}
          onCancel={onClose}
          onCodeChanged={closeEditor}
          onDelete={closeEditor}
        />
      ) : (
        <>
          <SpanListHeader count={annotation.spans.length} onClose={onClose} />
          <div className="flex max-h-[140px] flex-col gap-1.5 overflow-y-auto pr-0.5">
            {annotation.spans.map((span) => (
              <SpanListRow
                key={span.id}
                span={span}
                options={annotation.options}
                isDark={isDark}
                variant="list"
                onClick={() => edit(span)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SpanListHeader({ count, onClose }: { count: number; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-1.5">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 cursor-pointer gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back</span>
        </Button>
        <span className="text-xs font-semibold text-foreground">All labeled spans ({count}):</span>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        title="Close list"
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
