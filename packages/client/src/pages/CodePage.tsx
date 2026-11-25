import { useEffect, useState } from "react";
import { StudyRunner } from "../lib/components/StudyRunner";
import { rememberStudy } from "../lib/session/studies";

/**
 * Coding (`/code/<deployment>`, the study's public id): the study as coders see it, without the
 * app's header. A coder link adds `?link=<secret>`, and may carry URL
 * parameters (the coder id, the design's URL parameters); "Continue on
 * another device" links add `?transfer=<token>`; without either, this
 * device's session for the deployment continues (the device cookie).
 * `?login=1`: the coder chose to code with their account (`useLoginChoice`).
 */
export function CodePage({
  deployment,
  apiUrl,
  search,
  onTransferRedeemed,
  onLoginChoiceRead,
}: {
  deployment: string;
  apiUrl: string;
  search: Record<string, string>;
  onTransferRedeemed: () => void;
  /** Takes `login` out of the URL. */
  onLoginChoiceRead: () => void;
}) {
  // Everything else in the URL goes to the server: the coder id and the design's URL parameters
  const { link, transfer, login, ...urlParams } = search;
  const useLogin = useLoginChoice(login, onLoginChoiceRead);
  // The coder home lists the studies this browser opened (not the link's secret)
  const paramsKey = JSON.stringify(urlParams);
  useEffect(() => {
    rememberStudy({ deployment, params: JSON.parse(paramsKey) as Record<string, string> });
  }, [deployment, paramsKey]);
  return (
    // The visible height (dvh), so a phone browser's toolbar doesn't cover the answer buttons;
    // the screen's height where the browser doesn't know dvh
    <div className="h-screen overflow-hidden bg-background text-foreground supports-[height:100dvh]:h-dvh">
      <StudyRunner
        baseUrl={`${apiUrl}/d/${encodeURIComponent(deployment)}`}
        linkSecret={link}
        urlParams={urlParams}
        useLogin={useLogin}
        transferToken={transfer}
        onTransferRedeemed={onTransferRedeemed}
        homeUrl="/code"
      />
    </div>
  );
}

/**
 * Whether the coder chose to code with their account: `login=1` in the URL
 * they came in with (back from signing in on the coding screen, or from
 * their studies on the coder home). Kept while the page is open, and taken
 * out of the URL at once: a link copied from the address bar never makes
 * someone else's login count.
 */
function useLoginChoice(login: string | undefined, onRead: () => void): boolean {
  const [chosen] = useState(login === "1");
  useEffect(() => {
    if (login !== undefined) onRead();
  }, [login, onRead]);
  return chosen;
}
