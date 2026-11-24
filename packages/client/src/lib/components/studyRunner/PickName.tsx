import { useEffect, useState } from "react";
import type { PickNamesResponse } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { LogoSmoke } from "@/components/Logo";
import { HttpCoderApi } from "../../api/httpCoderApi";
import { SessionNotice } from "./SessionNotice";

/**
 * A link where coders pick their name (docs/coder-identity.md): the coders'
 * names, those another device picked (where a name stays on the first
 * device) shown as taken.
 */
export function PickName({
  baseUrl,
  linkSecret,
  taken,
  onPick,
}: {
  baseUrl: string;
  linkSecret?: string;
  /** The name just picked, which turned out to be taken. */
  taken?: string;
  onPick: (name: string) => void;
}) {
  const [names, setNames] = useState<PickNamesResponse["names"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    HttpCoderApi.getNames({ baseUrl, linkSecret })
      .then((r) => !cancelled && setNames(r.names))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [baseUrl, linkSecret]);
  return (
    <SessionNotice title="Who are you?">
      <p>Pick your name to start. You continue with it on this device.</p>
      {taken && <p className="text-destructive">{taken} was already picked on another device: pick your own name.</p>}
      {error && <p className="text-destructive">{error}</p>}
      {names === null && !error && <LogoSmoke label="Loading names…" />}
      {names && names.length === 0 && <p>There are no names to pick yet: ask the researchers.</p>}
      {names && names.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {names.map(({ name, taken: isTaken }) => (
            <Button
              key={name}
              type="button"
              variant="outline"
              disabled={isTaken}
              title={isTaken ? "Picked on another device" : undefined}
              onClick={() => onPick(name)}
            >
              {name}
              {isTaken && <span className="ml-1 text-xs text-muted-foreground">(taken)</span>}
            </Button>
          ))}
        </div>
      )}
    </SessionNotice>
  );
}
