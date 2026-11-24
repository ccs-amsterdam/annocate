import type { NominalOption, SpanAnswer } from "@annotinder/contracts";
import { markBackground, type Mark } from "../../codebook/highlights";
import { getStackedUnderlineStyle } from "../../utils/color";
import { optionColor, optionLabelOf, spanSummary, type Segment } from "../spanText";

interface TextSegmentProps {
  segment: Segment;
  /** The segment's text. */
  content: string;
  /** The keyboard's cursor is on this word: an outline. */
  atCursor: boolean;
  /** The layout's highlight on this text, if any. */
  highlight?: Mark;
  options: NominalOption[];
  /** The span being edited: highlighted in the text. */
  focusedSpanId: string | null;
  onSpanClick: (e: React.MouseEvent, spans: SpanAnswer[]) => void;
}

interface MarkProps {
  content: string;
  /** For the word the keyboard is on: its attribute and outline. */
  cursorProps: { "data-cursor"?: "" };
  cursorClass: string;
}

/**
 * A stretch of a field's text with the same spans on it: marked with its
 * spans, else as part of the new selection, else with the layout's
 * highlight, else plain.
 */
export function TextSegment({
  segment,
  content,
  atCursor,
  highlight,
  options,
  focusedSpanId,
  onSpanClick,
}: TextSegmentProps) {
  const mark: MarkProps = {
    content,
    cursorProps: atCursor ? { "data-cursor": "" } : {},
    cursorClass: atCursor ? "rounded-xs outline-2 outline-offset-1 outline-primary" : "",
  };
  if (segment.spans.length > 0) {
    return (
      <SpanMark {...mark} segment={segment} options={options} focusedSpanId={focusedSpanId} onClick={onSpanClick} />
    );
  }
  if (segment.isPending) return <PendingMark {...mark} />;
  if (highlight) return <HighlightMark {...mark} highlight={highlight} />;
  return (
    <span {...mark.cursorProps} className={mark.cursorClass || undefined}>
      {content}
    </span>
  );
}

/** Part of the new selection waiting for its label. */
function PendingMark({ content, cursorProps, cursorClass }: MarkProps) {
  return (
    <mark {...cursorProps} className={`rounded-xs bg-wood/25 text-foreground ring-2 ring-wood/70 ${cursorClass}`}>
      {content}
    </mark>
  );
}

/** Words the layout highlights. */
function HighlightMark({ content, cursorProps, cursorClass, highlight }: MarkProps & { highlight: Mark }) {
  return (
    <mark
      {...cursorProps}
      data-highlight=""
      className={cursorClass || undefined}
      style={{ backgroundColor: markBackground(highlight.color), color: "inherit" }}
    >
      {content}
    </mark>
  );
}

/** Text with spans on it. One span: its highlight; several overlapping: stacked colour bands. Clicking opens them. */
function SpanMark({
  content,
  cursorProps,
  cursorClass,
  segment,
  options,
  focusedSpanId,
  onClick,
}: MarkProps &
  Pick<TextSegmentProps, "segment" | "options" | "focusedSpanId"> & { onClick: TextSegmentProps["onSpanClick"] }) {
  const { spans } = segment;
  const style = getStackedUnderlineStyle(
    spans.map((s) => ({
      color: optionColor(options, s.value),
      isStart: s.slices.some((sl) => sl.offset === segment.start),
      isEnd: s.slices.some((sl) => sl.offset + sl.length === segment.end),
    })),
  );
  const title = spans.map((s) => `${optionLabelOf(options, s.value)}: "${spanSummary(s.slices)}"`).join(", ");
  const isFocused = Boolean(focusedSpanId && spans.some((s) => s.id === focusedSpanId));
  return (
    <mark
      {...cursorProps}
      data-span-id={spans.map((s) => s.id).join(" ")}
      style={style}
      title={title}
      onClick={(e) => onClick(e, spans)}
      className={`cursor-pointer font-normal transition-opacity hover:opacity-85 ${
        isFocused || segment.isPending ? "ring-2 ring-wood ring-offset-1 ring-offset-background" : ""
      } ${cursorClass}`}
    >
      {content}
    </mark>
  );
}
