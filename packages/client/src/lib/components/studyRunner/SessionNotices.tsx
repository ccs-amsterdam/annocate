import { useEffect, useState, type ReactNode } from "react";
import type { PickNamesResponse } from "@annotinder/contracts";
import { AlertTriangle, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoSmoke } from "@/components/Logo";
import { HttpCoderApi } from "../../api/httpCoderApi";
import { coderLoginUrl, loginAvailable, logOut } from "../../session/coderSession";

// What the coding screen shows instead of a question: loading, and the
// errors a coder can run into (the server's error codes, contracts `CoderErrorCode`).

export function LoadingScreen() {
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center p-8 text-center">
      <LogoSmoke label="Loading session…" />
    </div>
  );
}

/** A session that failed to load or save: the notice for its error code, else the message with Retry. */
export function SessionErrorScreen({
  error,
  errorCode,
  onRetry,
  onStartNewSession,
  baseUrl,
  linkSecret,
  coderName,
  onPickName,
}: {
  error: string | null;
  errorCode: string | null;
  onRetry: () => void;
  onStartNewSession: () => void;
  baseUrl: string;
  linkSecret?: string;
  /** On a pick-your-name link: the name picked, and picking (again). */
  coderName?: string;
  onPickName: (name: string) => void;
}) {
  if (errorCode === "coder_has_session") return <CoderElsewhere onStartNewSession={onStartNewSession} />;

  if (errorCode === "name_required" || errorCode === "name_taken") {
    return (
      <PickName
        baseUrl={baseUrl}
        linkSecret={linkSecret}
        taken={errorCode === "name_taken" ? coderName : undefined}
        onPick={onPickName}
      />
    );
  }

  if (errorCode === "study_paused") {
    return (
      <SessionNotice title="This study is paused">
        <p>
          The researchers paused it for a while. Anything you answered is saved, and you can continue where you left off
          once it goes on.
        </p>
        <p>Please try again later: open your link again, or check now.</p>
        <Button type="button" variant="outline" className="mt-2" onClick={onRetry}>
          Check again
        </Button>
      </SessionNotice>
    );
  }

  if (errorCode === "auth_required") return <LoginNotice />;

  if (errorCode === "email_not_allowed") {
    return (
      <SessionNotice title="This email address has no access to this study">
        <p>
          The researchers gave this study to specific email addresses, and the account you are signed in with isn&apos;t
          one of them.
        </p>
        <p>If you were given it with another email address, sign in with that account.</p>
        <Button
          type="button"
          variant="outline"
          className="mt-2"
          onClick={() => void logOut().then(() => window.location.assign(coderLoginUrl()))}
        >
          Sign in with another account
        </Button>
      </SessionNotice>
    );
  }

  const linkNotice = LINK_NOTICES[errorCode ?? ""];
  if (linkNotice) {
    return (
      <SessionNotice title={linkNotice.title}>
        <p>{linkNotice.text}</p>
      </SessionNotice>
    );
  }

  if (errorCode === "url_param_missing" || errorCode === "url_param_invalid") {
    return (
      <SessionNotice title="This link is incomplete">
        <p>{error}.</p>
        <p>
          Check that you opened the whole link you were given. If you came from a panel or another website, go back and
          follow its link again; if that doesn&apos;t help, contact the researchers.
        </p>
      </SessionNotice>
    );
  }

  return (
    <div className="flex h-full min-h-[300px] items-center justify-center p-6">
      <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-destructive/20 bg-card p-6 text-center shadow-lg">
        <div className="rounded-full bg-destructive/10 p-3 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h3 className="mt-3 text-lg font-semibold text-foreground">Something went wrong</h3>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <Button type="button" className="mt-5" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}

/** What a coder sees when their link can't start a session (the server's error codes). */
const LINK_NOTICES: Partial<Record<string, { title: string; text: string }>> = {
  link_not_found: {
    title: "This link doesn't work",
    text: "Check that you opened the whole link you were given. If it still doesn't work, contact the researchers.",
  },
  link_revoked: {
    title: "This link has been withdrawn",
    text: "The researchers no longer accept new coders through this link. If you were sent a new link, use that one.",
  },
  link_used_up: {
    title: "This link is full",
    text: "As many people as the researchers planned have already started through this link. Thank you for your interest.",
  },
  link_inactive: {
    title: "This link is no longer active",
    text: "The researchers no longer use this link for new coders. If you were sent a new link, use that one.",
  },
};

export function SessionNotice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-[300px] items-center justify-center p-6">
      <div className="mx-auto flex max-w-md flex-col items-center gap-2 rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground shadow-lg">
        <div className="rounded-full bg-primary/10 p-3 text-primary">
          <MonitorSmartphone className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        {children}
      </div>
    </div>
  );
}

/** A link that needs a login (docs/coder-identity.md §5). */
function LoginNotice() {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    void loginAvailable().then(setAvailable);
  }, []);
  return (
    <SessionNotice title="This study asks you to sign in">
      <p>
        Sign in before you start. Your answers are then kept with your account: sign in again to continue later, on any
        device. If the researchers gave you this study by email address, use that address.
      </p>
      {available === false ? (
        <p>This server doesn&apos;t offer a sign-in, though. Please contact the researchers.</p>
      ) : (
        <Button
          type="button"
          className="mt-2"
          disabled={available === null}
          onClick={() => window.location.assign(coderLoginUrl())}
        >
          Sign in
        </Button>
      )}
    </SessionNotice>
  );
}

/**
 * A link where coders pick their name (docs/coder-identity.md): the coders'
 * names, those another device picked (where a name stays on the first
 * device) shown as taken.
 */
function PickName({
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

/**
 * A coder id that already has a session on another device or browser
 * (docs/coder-identity.md §4). Normally the coder continues there; a new
 * session is only for a coder who can't get back to the earlier one (a lost
 * device, cleared browser data), after confirming that.
 */
function CoderElsewhere({ onStartNewSession }: { onStartNewSession: () => void }) {
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
