import { RotateCcw, Trash2 } from "lucide-react";
import type { CoderProgress } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { formatWhen } from "../../../admin/format";
import { coderName } from "./coderName";

const SPECIAL_KINDS = ["overlap", "gold", "practice"] as const;
type SpecialKind = (typeof SPECIAL_KINDS)[number];

const ENDED_TEXT = { complete: "Complete", screenout: "Screened out", quit: "Quit" };

/** How a session ended, in words. */
function endedText(ended: CoderProgress["ended"]): string {
  return ended ? ENDED_TEXT[ended.outcome] : "–";
}

/**
 * The coder sessions: the link, when each started and was last active, its
 * answers, how it ended, the units finished per loop of the live design
 * version and of the special sets the study has, and per session resetting
 * its answers or deleting its data.
 */
export function CodersTable({
  coders,
  onReset,
  onDelete,
}: {
  coders: CoderProgress[];
  onReset: (coder: CoderProgress) => void;
  onDelete: (coder: CoderProgress) => void;
}) {
  // Loops of the live design version (the same for every coder)
  const loops = (coders[0]?.finished ?? []).map(({ loop, title }) => ({ loop, title }));
  // The special sets the study has (overlap, gold, practice): units of them each coder finished
  const specials = SPECIAL_KINDS.filter((kind) => coders.some((c) => c.special?.[kind]));
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            <th className="p-2 font-medium">Coder</th>
            <th className="p-2 font-medium">Link</th>
            <th className="p-2 font-medium">Started</th>
            <th className="p-2 font-medium">Last active</th>
            <th className="p-2 text-right font-medium">Answers</th>
            <th className="p-2 font-medium">Ended</th>
            {loops.map(({ loop, title }) => (
              <th key={loop} className="p-2 text-right font-medium" title={`Unit loop ${loop}`}>
                Finished in <span className="font-mono">{title}</span>
              </th>
            ))}
            {specials.map((kind) => (
              <th
                key={kind}
                className="p-2 text-right font-medium capitalize"
                title={`Units of the deployed _${kind} set this coder finished`}
              >
                {kind}
              </th>
            ))}
            <th className="p-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {coders.map((coder) => (
            <CoderSessionRow
              key={coder.id}
              coder={coder}
              loops={loops}
              specials={specials}
              onReset={() => onReset(coder)}
              onDelete={() => onDelete(coder)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CoderSessionRow({
  coder,
  loops,
  specials,
  onReset,
  onDelete,
}: {
  coder: CoderProgress;
  loops: { loop: string; title: string }[];
  specials: SpecialKind[];
  onReset: () => void;
  onDelete: () => void;
}) {
  const named = coder.coder || coder.email;
  const special = (kind: SpecialKind) => {
    const progress = coder.special?.[kind];
    return progress ? `${progress.done} of ${progress.total}` : "–";
  };
  return (
    <tr className="border-b last:border-0">
      <td className="p-2">{named ? coderName(coder) : <span className="text-muted-foreground">#{coder.id}</span>}</td>
      <td className="p-2 text-muted-foreground">{coder.linkLabel ?? "–"}</td>
      <td className="p-2 whitespace-nowrap text-muted-foreground">{formatWhen(coder.started)}</td>
      <td className="p-2 whitespace-nowrap">{formatWhen(coder.lastActive)}</td>
      <td className="p-2 text-right tabular-nums">{coder.answers}</td>
      <td
        className="p-2 whitespace-nowrap text-muted-foreground"
        title={coder.ended?.item ? `At ${coder.ended.item}` : undefined}
      >
        {endedText(coder.ended)}
        {coder.deletionRequest && (
          <span
            className="ml-1 text-xs text-amber-700 dark:text-amber-400"
            title={`Asked ${formatWhen(coder.deletionRequest.at)}`}
          >
            (deletion requested)
          </span>
        )}
      </td>
      {loops.map(({ loop }) => (
        <td key={loop} className="p-2 text-right tabular-nums">
          {coder.finished.find((f) => f.loop === loop)?.units ?? 0}
        </td>
      ))}
      {specials.map((kind) => (
        <td key={kind} className="p-2 text-right tabular-nums">
          {special(kind)}
        </td>
      ))}
      <td className="p-2 text-right whitespace-nowrap">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Reset ${coderName(coder)}'s answers`}
          title="Reset this coder's answers"
          onClick={onReset}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${coderName(coder)}'s data`}
          title="Delete this coder's data"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );
}
