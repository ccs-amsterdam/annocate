import { useEffect, useState, type ReactNode } from "react";
import type { AuthOptions, LoginError, MeResponse } from "@annotinder/contracts";
import { ResearcherApiError, type ResearcherApi } from "../../../api/httpResearcherApi";
import { Button } from "@/components/ui/button";
import { LogIn, ShieldCheck } from "lucide-react";

const LOGIN_ERRORS: Record<LoginError, string> = {
  email_unverified: "Your login provider did not confirm your email address. Verify it there and try again.",
  blocked: "This account is blocked on this server. Contact its administrators if you think this is a mistake.",
  login_failed: "Logging in didn't work. Please try again.",
};

/** The `loginError` the server added to this page's URL after a refused login, if any. */
function loginErrorFromUrl(): LoginError | null {
  if (typeof window === "undefined") return null;
  const code = new URLSearchParams(window.location.search).get("loginError");
  return code && code in LOGIN_ERRORS ? (code as LoginError) : null;
}

type State =
  | { status: "loading" }
  | { status: "in"; me: MeResponse }
  | { status: "out"; options: AuthOptions | null }
  | { status: "error"; message: string };

/**
 * Shows `children` to a logged-in researcher, and a login screen otherwise
 * (docs/api/researcher.md). Logging in leaves the page for the login
 * provider and comes back to it.
 */
export function ResearcherGate({ client, children }: { client: ResearcherApi; children: (me: MeResponse) => ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [loginError] = useState(loginErrorFromUrl);

  useEffect(() => {
    let cancelled = false;
    client
      .getMe()
      .then((me) => !cancelled && setState({ status: "in", me }))
      .catch(async (err: unknown) => {
        if (cancelled) return;
        if (err instanceof ResearcherApiError && err.status === 401) {
          const options = await client.getAuthOptions().catch(() => null);
          if (!cancelled) setState({ status: "out", options });
        } else {
          setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (state.status === "in" && state.me.mfaRequired) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h1 className="font-heading text-lg font-bold">Log in with a second factor</h1>
          <p className="text-sm text-muted-foreground">
            This server asks for two-factor authentication to manage jobs, and your login ({state.me.email}) didn&apos;t use
            one. Set it up with your login provider, then log out and in again. Coding works without it.
          </p>
          <Button variant="outline" onClick={() => void client.logout().then(() => window.location.reload())}>
            Log out
          </Button>
        </div>
      </div>
    );
  }
  if (state.status === "in") return <>{children(state.me)}</>;
  if (state.status === "loading") return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (state.status === "error") return <p className="p-6 text-sm text-destructive">Can't reach the server: {state.message}</p>;

  function logIn() {
    // Back to this page, without a previous error.
    const url = new URL(window.location.href);
    url.searchParams.delete("loginError");
    window.location.assign(client.loginUrl(url.pathname + url.search + url.hash));
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="font-heading text-lg font-bold">Log in to manage jobs</h1>
        {loginError && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{LOGIN_ERRORS[loginError]}</p>}
        {state.options?.login ? (
          <>
            <Button onClick={logIn}>
              <LogIn className="mr-2 h-4 w-4" /> Log in
            </Button>
            <p className="flex gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              We recommend turning on two-factor authentication with your login provider, especially for jobs with sensitive data.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            This server has no login configured. Scripts can use an API key; ask the server's administrator for one.
          </p>
        )}
      </div>
    </div>
  );
}
