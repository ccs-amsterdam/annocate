import { useMemo, useState } from "react";
import { CODER_SET, type SetGroupResponse, type UnitSet } from "@annotinder/contracts";
import { ArrowRight, Loader2, UserMinus, UserPlus, X } from "lucide-react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useCoderUnitsQuery, usePutSetGroupMutation } from "../../../admin/queries";
import { coderCounts, moveUnits, spreadUnits, type CoderWork } from "../../../admin/moveUnits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-sm";

/**
 * The coders of the coder set (`coder_set`), with how many of their units
 * they coded and have left; moves units they haven't coded to another coder,
 * hands all of a coder's uncoded units to the others, or adds a coder.
 * Coded units stay with their coder. Changes the draft: coders get them
 * with the next deploy of the units.
 */
export function CodersPanel({
  client,
  group,
  onClose,
}: {
  client: ResearcherApi;
  group: SetGroupResponse;
  onClose: () => void;
}) {
  const coderUnits = useCoderUnitsQuery(client);
  const putGroup = usePutSetGroupMutation(client);
  const work: CoderWork = useMemo(
    () =>
      new Map(
        (coderUnits.data?.coders ?? []).map((c) => [c.coder, { coded: new Set(c.coded), served: new Set(c.served) }]),
      ),
    [coderUnits.data],
  );
  const counts = coderCounts(group.sets, work);
  const names = group.sets.map((s) => s.name);
  const [fromChoice, setFrom] = useState(names[0] ?? "");
  const [toChoice, setTo] = useState(names[1] ?? "");
  // A coder who left the coder set: the first (or second) one instead
  const from = names.includes(fromChoice) ? fromChoice : (names[0] ?? "");
  const to = names.includes(toChoice) ? toChoice : (names.find((n) => n !== from) ?? "");
  const [count, setCount] = useState(10);
  const [newName, setNewName] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const fromLeft = counts.find((c) => c.coder === from)?.toCode ?? 0;

  function save(sets: UnitSet[], message: string) {
    setDone(null);
    putGroup.mutate({ group: CODER_SET, body: { sets } }, { onSuccess: () => setDone(message) });
  }

  const nameTaken = names.some((n) => n.toLowerCase() === newName.trim().toLowerCase());
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-sm">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">Coders</h3>
          <p className="text-xs text-muted-foreground">
            Move units a coder hasn&apos;t coded to another coder. Units they coded stay theirs. Coders get the changes
            when you deploy the units.
          </p>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label="Close" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </header>

      {coderUnits.isLoading ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : (
        <table className="w-full max-w-2xl text-left">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Coder</th>
              <th className="py-1 text-right font-medium">Units</th>
              <th className="py-1 text-right font-medium">Coded</th>
              <th className="py-1 text-right font-medium">To code</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {counts.map((c) => (
              <tr key={c.coder} className="border-t border-border">
                <td className="py-1.5 font-mono text-xs">{c.coder}</td>
                <td className="py-1.5 text-right tabular-nums">{c.units}</td>
                <td className="py-1.5 text-right tabular-nums">{c.coded}</td>
                <td className="py-1.5 text-right font-medium tabular-nums">{c.toCode}</td>
                <td className="py-1.5 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-xs"
                    disabled={putGroup.isPending || names.length < 2 || c.toCode === 0}
                    title={`Hand ${c.coder}'s units they haven't coded to the other coders`}
                    onClick={() => {
                      const result = spreadUnits(group.sets, c.coder, work);
                      const left = !result.sets.some((s) => s.name === c.coder);
                      const question = `Hand ${c.coder}'s ${c.toCode} units they haven't coded to the other coders?${
                        left ? ` ${c.coder} coded none, so they leave the coder set (their link stops working).` : ""
                      }`;
                      if (confirm(question))
                        save(result.sets, `${result.moved} units of ${c.coder} went to the other coders.`);
                    }}
                  >
                    <UserMinus className="h-3.5 w-3.5" /> Hand out
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {names.length >= 2 && (
        <form
          className="flex flex-wrap items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const result = moveUnits(group.sets, from, to, Math.min(count, fromLeft), work);
            save(result.sets, `${result.moved} units moved from ${from} to ${to}.`);
          }}
        >
          Move
          <Input
            type="number"
            aria-label="How many units"
            min={1}
            max={fromLeft}
            value={Math.min(count, Math.max(1, fromLeft))}
            onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
            className="h-8 w-20"
          />
          units from
          <select
            aria-label="From coder"
            className={selectClass}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          >
            {names.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
          <select aria-label="To coder" className={selectClass} value={to} onChange={(e) => setTo(e.target.value)}>
            {names.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <Button size="sm" type="submit" disabled={putGroup.isPending || from === to || fromLeft === 0}>
            Move
          </Button>
          <span className="text-xs text-muted-foreground">
            {from} has {fromLeft} to code. Units they were never sent go first.
          </span>
        </form>
      )}

      <form
        className="flex flex-wrap items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName.trim();
          save([...group.sets, { name, unitIds: [], ordered: false }], `${name} was added: move units to them.`);
          setNewName("");
          setTo(name);
        }}
      >
        <Input
          aria-label="New coder"
          placeholder="New coder"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="h-8 w-48"
        />
        <Button size="sm" variant="outline" type="submit" className="gap-1" disabled={!newName.trim() || nameTaken}>
          <UserPlus className="h-3.5 w-3.5" /> Add coder
        </Button>
        {nameTaken && <span className="text-xs text-destructive">There is a coder with this name.</span>}
      </form>

      {done && !putGroup.isPending && (
        <p role="status" className="text-xs font-medium text-primary">
          {done} Deploy the units to give coders the change.
        </p>
      )}
      {putGroup.isError && <p className="text-sm text-destructive">{putGroup.error.message}</p>}
    </section>
  );
}
