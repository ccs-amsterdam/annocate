import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SessionNotice } from "./SessionNotice";

/**
 * A coder id that already has a session on another device or browser
 * (docs/coder-identity.md §4). Normally the coder continues there; a new
 * session is only for a coder who can't get back to the earlier one (a lost
 * device, cleared browser data), after confirming that.
 */
export function CoderElsewhere({ onStartNewSession }: { onStartNewSession: () => void }) {
  const [cantReturn, setCantReturn] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  return (
    <SessionNotice title="You already started on another device">
      <p>
        This link was already used to start on another device or browser. Your answers so far are there, and that is
        where you continue.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Open this link again on the device and browser where you started.</li>
        <li>
          To continue <em>here</em>: on that device, open &quot;Continue on another device&quot; (top right) and open
          the link or scan the code it shows here. If the study lets you log in, you can also log in there, and then log
          in here.
        </li>
      </ul>
      {!cantReturn ? (
        <Button type="button" variant="ghost" className="mt-2 self-start" onClick={() => setCantReturn(true)}>
          I can&apos;t get back to my earlier session…
        </Button>
      ) : (
        <div className="mt-2 flex flex-col gap-2 rounded-md border border-amber-500/60 bg-amber-500/10 p-3">
          <p>
            Starting again should rarely be needed: only when you can&apos;t (easily) use the device or browser where
            you started, for instance because you lost it or its browser data was cleared. A new session starts from the
            beginning, without your earlier answers, and the researchers see that this link started twice.
          </p>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>I can&apos;t get back to the device or browser where I started.</span>
          </label>
          <Button
            type="button"
            variant="outline"
            className="self-start"
            disabled={!confirmed}
            onClick={onStartNewSession}
          >
            Start a new session
          </Button>
        </div>
      )}
    </SessionNotice>
  );
}
