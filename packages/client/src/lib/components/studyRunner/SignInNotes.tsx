import type { SignIn } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { coderLoginUrl, logInWithAccount } from "../../session/coderSession";
import { X } from "lucide-react";
import { useState } from "react";

/**
 * What "Continue on another device" says about signing in
 * (docs/coder-identity.md §5), under its transfer link:
 * - a session that has a login: how to continue with it on the other
 *   device (where the study requires sign-in: sign in there; else choose
 *   **Log in** there);
 * - a coder who may sign in and hasn't (`canLogIn`): the offer.
 */
export function SignInNotes({ login, canLogIn, signIn }: { login: string | null; canLogIn: boolean; signIn: SignIn }) {
  return (
    <>
      {login && signIn === "required" && (
        <p className="border-t pt-2.5 text-[11px] text-muted-foreground">
          Or sign in on the other device: open this study&apos;s link there and sign in as <strong>{login}</strong>.
        </p>
      )}
      {login && signIn !== "required" && (
        <p className="border-t pt-2.5 text-[11px] text-muted-foreground">
          Or open this study&apos;s link on the other device and choose <strong>Log in</strong> there (on the notice
          that you already started, or under &quot;Continue on another device&quot;): log in as <strong>{login}</strong>
          .
        </p>
      )}
      {canLogIn && (
        <div className="space-y-1.5 border-t pt-2.5">
          <p className="text-[11px] text-muted-foreground">
            Sign in to continue from any device. The researchers don&apos;t see your email address.
          </p>
          <Button type="button" size="sm" variant="outline" className="w-full" onClick={logInWithAccount}>
            Log in
          </Button>
        </div>
      )}
    </>
  );
}

/**
 * One line for a device that joined the session by a transfer link, while
 * its browser isn't logged in: logging in here brings the coder's saved
 * settings (theme, keys) to this device. Until dismissed.
 */
export function SignInHereLine() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-border px-4 py-1 text-xs text-muted-foreground"
    >
      <span>Sign in here too to use your saved settings</span>
      <button
        type="button"
        className="font-medium text-primary hover:underline"
        onClick={() => window.location.assign(coderLoginUrl())}
      >
        Log in
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="rounded p-0.5 hover:bg-muted hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
