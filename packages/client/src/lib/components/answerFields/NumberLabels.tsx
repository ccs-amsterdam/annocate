/** Break-point labels at their positions under buttons or a slider. */
export function NumberLabels({
  labels,
  min,
  max,
}: {
  labels: { value: number; label: string }[];
  min: number;
  max: number;
}) {
  if (!labels.length) return null;
  return (
    <div className="relative h-4 text-xs text-muted-foreground">
      {labels.map((l) => {
        const pct = ((l.value - min) / (max - min)) * 100;
        return (
          <span key={l.value} className={`absolute whitespace-nowrap ${alignAt(pct)}`} style={{ left: `${pct}%` }}>
            {l.label}
          </span>
        );
      })}
    </div>
  );
}

/** A label is centred on its position, but stays inside at the ends. */
function alignAt(pct: number): string {
  if (pct < 15) return "translate-x-0";
  if (pct > 85) return "-translate-x-full";
  return "-translate-x-1/2";
}
