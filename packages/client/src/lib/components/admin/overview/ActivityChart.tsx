import { useState } from "react";
import type { JobOverview } from "@annotinder/contracts";

type Day = JobOverview["activity"][number];

const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Answers per day as columns (one series, so no legend: the heading names it).
 * Hover a day for its numbers; a visually hidden table carries the same data.
 */
export function ActivityChart({ activity }: { activity: Day[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(...activity.map((d) => d.answers));
  const top = niceCeil(max);

  if (max === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No answers in the last 30 days.</p>;
  }

  return (
    <div>
      <div className="relative flex h-32">
        {/* y-axis: top value and baseline */}
        <div className="flex w-8 shrink-0 flex-col justify-between pr-1.5 text-right text-[10px] tabular-nums text-muted-foreground">
          <span className="-translate-y-1/2">{top}</span>
          <span className="translate-y-1/2">0</span>
        </div>

        <div className="relative flex-1 border-b border-border">
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-border/60" />
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {activity.map((d, i) => (
              <div
                key={d.day}
                className="flex h-full flex-1 cursor-default items-end justify-center"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                {d.answers > 0 && (
                  <div
                    className={`w-full max-w-6 rounded-t bg-[#39ac9f] dark:bg-[#33a497] ${
                      hovered !== null && hovered !== i ? "opacity-60" : ""
                    }`}
                    style={{ height: `${(d.answers / top) * 100}%` }}
                  />
                )}
              </div>
            ))}
          </div>

          {hovered !== null && <Tooltip day={activity[hovered]} left={((hovered + 0.5) / activity.length) * 100} />}
        </div>
      </div>

      <div className="ml-8 mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{dayLabel(activity[0].day)}</span>
        <span>{dayLabel(activity[activity.length - 1].day)}</span>
      </div>

      <table className="sr-only">
        <caption>Answers per day</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Answers</th>
            <th>Coders</th>
          </tr>
        </thead>
        <tbody>
          {activity.map((d) => (
            <tr key={d.day}>
              <td>{d.day}</td>
              <td>{d.answers}</td>
              <td>{d.coders}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tooltip({ day, left }: { day: Day; left: number }) {
  return (
    <div
      className="pointer-events-none absolute bottom-full z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
      style={{ left: `${left}%` }}
    >
      <div className="font-medium">{dayLabel(day.day)}</div>
      <div className="text-muted-foreground">
        {day.answers} answer{day.answers === 1 ? "" : "s"} · {day.coders} coder{day.coders === 1 ? "" : "s"}
      </div>
    </div>
  );
}

/** Rounds up to 1, 2 or 5 times a power of ten, for a clean axis maximum. */
function niceCeil(n: number): number {
  if (n <= 1) return 1;
  const power = 10 ** Math.floor(Math.log10(n));
  for (const step of [1, 2, 5, 10]) if (n <= step * power) return step * power;
  return 10 * power;
}
