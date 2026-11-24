import { useEffect, useState, type ComponentType } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { coderLoginUrl, loginAvailable, logOut } from "../../session/coderSession";
import { CoderElsewhere } from "./CoderElsewhere";
import { PickName } from "./PickName";
import { SessionNotice } from "./SessionNotice";

// The errors a coder can run into (the server's error codes, contracts
// `CoderErrorCode`): what the coding screen shows instead of a question.

interface SessionErrorProps {
  error: string | null;
  errorCode: string | null;
  onRetry: () => void;
  onStartNewSession: () => void;
  baseUrl: string;
  linkSecret?: string;
  /** On a pick-your-name link: the name picked, and picking (again). */
  coderName?: string;
  onPickName: (name: string) => void;
}

/** The notice for each error code that has its own. */
const ERROR_NOTICES: Partial<Record<string, ComponentType<SessionErrorProps>>> = {
  coder_has_session: ({ onStartNewSession }) => <CoderElsewhere onStartNewSession={onStartNewSession} />,
  name_required: PickNameNotice,
  name_taken: PickNameNotice,
  study_paused: StudyPausedNotice,
  auth_required: LoginNotice,
  email_not_allowed: EmailNotAllowedNotice,
  link_not_found: LinkNotice,
  link_revoked: LinkNotice,
  link_used_up: LinkNotice,
  link_inactive: LinkNotice,
  url_param_missing: IncompleteLinkNotice,
  url_param_invalid: IncompleteLinkNotice,
};

/** A session that failed to load or save: the notice for its error code, else the message with Retry. */
export function SessionErrorScreen(props: SessionErrorProps) {
  const Notice = ERROR_NOTICES[props.errorCode ?? ""];
  if (Notice) return <Notice {...props} />;
  return <UnknownError error={props.error} onRetry={props.onRetry} />;
}

function UnknownError({ error, onRetry }: Pick<SessionErrorProps, "error" | "onRetry">) {
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

function PickNameNotice({ errorCode, baseUrl, linkSecret, coderName, onPickName }: SessionErrorProps) {
  return (
    <PickName
      baseUrl={baseUrl}
      linkSecret={linkSecret}
      taken={errorCode === "name_taken" ? coderName : undefined}
      onPick={onPickName}
    />
  );
}

function StudyPausedNotice({ onRetry }: SessionErrorProps) {
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

function EmailNotAllowedNotice() {
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

/** A link that can't start a session. */
function LinkNotice({ errorCode }: SessionErrorProps) {
  const notice = LINK_NOTICES[errorCode ?? ""];
  if (!notice) return null;
  return (
    <SessionNotice title={notice.title}>
      <p>{notice.text}</p>
    </SessionNotice>
  );
}

function IncompleteLinkNotice({ error }: SessionErrorProps) {
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
