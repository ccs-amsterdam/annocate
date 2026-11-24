import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { useRelationAnnotation } from "../context/relationAnnotation";
import { optionColor, optionLabelOf } from "./spanText";

// Arrows between related spans (docs/client.md §4 "Span and relation
// answers"). The SVG sits inside the unit's content and is positioned
// against it, so it scrolls with the text by itself: positions are only
// measured again when the layout can change (the relations, a resize of the
// content, fonts loading), never on scroll.

interface Point {
  x: number;
  y: number;
}

interface DrawnArrow {
  id: string;
  path: string;
  head: string;
  label: { x: number; y: number; text: string };
  color: string;
  ends: [string, string];
}

/** The rectangles (relative to `box`) of a span's parts, in text order. */
function spanRects(container: HTMLElement, box: DOMRect, spanId: string): DOMRect[] {
  const rects: DOMRect[] = [];
  for (const el of container.querySelectorAll(`[data-relation-span~="${CSS.escape(spanId)}"]`))
    for (const r of el.getClientRects()) rects.push(new DOMRect(r.left - box.left, r.top - box.top, r.width, r.height));
  return rects;
}

/** A cubic curve from `a` to `b` arching above both; its arrowhead and label point. */
function arc(a: Point, b: Point, lift: number) {
  // Kept inside the content box (the unit leaves room above the text during relation questions)
  const top = Math.max(2, Math.min(a.y, b.y) - lift);
  const c1 = { x: a.x + (b.x - a.x) * 0.25, y: top };
  const c2 = { x: a.x + (b.x - a.x) * 0.75, y: top };
  const mid = { x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8, y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8 };
  // The head points along the curve's end: from the second control point to the end
  const angle = Math.atan2(b.y - c2.y, b.x - c2.x);
  const size = 7;
  const corner = (turn: number) => `${b.x - size * Math.cos(angle + turn)},${b.y - size * Math.sin(angle + turn)}`;
  return {
    path: `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`,
    head: `${b.x},${b.y} ${corner(0.45)} ${corner(-0.45)}`,
    mid,
  };
}

export function RelationArrows({ containerRef }: { containerRef: RefObject<HTMLElement | null> }) {
  const ctx = useRelationAnnotation();
  const [arrows, setArrows] = useState<DrawnArrow[]>([]);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);

  // What the arrows are drawn from: pointing at one (`highlighted`) changes how it looks, not where it is
  const relations = ctx?.relations;
  const options = ctx?.options;
  const start = ctx?.start ?? null;
  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!relations || !options || !container) return;
    const box = container.getBoundingClientRect();
    const pairs = new Map<string, number>();
    const ends = new Map<string, number>();
    const drawn: DrawnArrow[] = [];
    for (const r of relations) {
      const from = spanRects(container, box, r.fromId);
      const to = spanRects(container, box, r.toId);
      if (from.length === 0 || to.length === 0) continue;
      // From the end of the first span to the start of the second, just above the text
      const last = from[from.length - 1];
      const first = to[0];
      // Arrows between the same spans, or sharing an end, are spread out
      const pair = [r.fromId, r.toId].sort().join("|");
      const n = pairs.get(pair) ?? 0;
      pairs.set(pair, n + 1);
      const shift = (id: string) => {
        const k = ends.get(id) ?? 0;
        ends.set(id, k + 1);
        return k * 6;
      };
      const a = { x: last.right - 3 - shift(r.fromId), y: last.top + 2 };
      const b = { x: first.left + 3 + shift(r.toId), y: first.top + 2 };
      const lift = Math.min(40, 14 + Math.abs(b.x - a.x) * 0.08 + Math.abs(b.y - a.y) * 0.3) + n * 12;
      const { path, head, mid } = arc(a, b, lift);
      drawn.push({
        id: r.id,
        path,
        head,
        label: { ...mid, text: optionLabelOf(options, r.value) },
        color: optionColor(options, r.value) ?? "var(--foreground)",
        ends: [r.fromId, r.toId],
      });
    }
    setArrows(drawn);
    const from = start ? spanRects(container, box, start).at(-1) : undefined;
    setStartPoint(from ? { x: from.right - 3, y: from.top + 2 } : null);
  }, [relations, options, start, containerRef]);

  // Measured when the relations or the start change, before paint
  useLayoutEffect(() => measure(), [measure]);

  // A resize of the content (the window, the font, the answer pane) moves the text; so can fonts loading
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(container);
    void document.fonts?.ready.then(() => measure());
    return () => observer.disconnect();
  }, [containerRef, measure]);

  // While a relation is started: an arrow follows the pointer
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !start) {
      setPointer(null);
      return;
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const box = container.getBoundingClientRect();
      setPointer({ x: e.clientX - box.left, y: e.clientY - box.top });
    };
    container.addEventListener("pointermove", onMove);
    return () => container.removeEventListener("pointermove", onMove);
  }, [containerRef, start]);

  if (!ctx) return null;
  const highlighted = ctx.highlighted;
  const isFull = (a: DrawnArrow) => highlighted === a.id || a.ends.includes(highlighted ?? "");
  const rubber = startPoint && pointer ? arc(startPoint, pointer, 20) : null;

  return (
    <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible" aria-hidden="true">
      {arrows.map((a) => {
        // Faint until pointed at (the arrow, its spans): then solid, with its label
        const full = isFull(a);
        const opacity = full ? 1 : highlighted === null ? 0.35 : 0.15;
        const width = a.label.text.length * 6.2 + 10;
        const events = {
          onClick: () => ctx.openRelation(a.id),
          onPointerEnter: () => ctx.setHighlighted(a.id),
          onPointerLeave: () => ctx.setHighlighted(null),
        };
        return (
          <g key={a.id} data-relation-arrow={a.id} style={{ opacity }} className="transition-opacity">
            <path d={a.path} fill="none" stroke={a.color} strokeWidth={full ? 2.5 : 1.75} />
            {/* A wider invisible line: easy to point at; clicking it opens the relation (to change or remove it) */}
            <path
              d={a.path}
              fill="none"
              stroke="transparent"
              strokeWidth={12}
              className="pointer-events-auto cursor-pointer"
              aria-label={a.label.text}
              {...events}
            />
            <polygon points={a.head} fill={a.color} />
            {full && (
              <g className="pointer-events-auto cursor-pointer" {...events}>
                <rect
                  x={a.label.x - width / 2}
                  y={a.label.y - 8}
                  width={width}
                  height={16}
                  rx={4}
                  fill="var(--background)"
                  stroke={a.color}
                />
                <text
                  x={a.label.x}
                  y={a.label.y + 3.5}
                  textAnchor="middle"
                  fontSize={10.5}
                  fontWeight={600}
                  fill="var(--foreground)"
                >
                  {a.label.text}
                </text>
              </g>
            )}
          </g>
        );
      })}
      {rubber && (
        <g opacity={0.7}>
          <path d={rubber.path} fill="none" stroke="var(--wood)" strokeWidth={2} strokeDasharray="5 4" />
          <polygon points={rubber.head} fill="var(--wood)" />
        </g>
      )}
    </svg>
  );
}
