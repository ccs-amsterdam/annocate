import { useEffect } from "react";
import { StudyRunner } from "../lib/components/StudyRunner";
import { rememberStudy } from "../lib/session/studies";

/**
 * Coding (`/code/<deployment>`): the study as coders see it, without the
 * app's header. A coder link adds `?link=<secret>`, and may carry URL
 * parameters (the coder id, the design's URL parameters); "Continue on
 * another device" links add `?transfer=<token>`; without either, this
 * device's session for the deployment continues (the device cookie).
 */
export function CodePage({
  deployment,
  apiUrl,
  search,
  onTransferRedeemed,
}: {
  deployment: string;
  apiUrl: string;
  search: Record<string, string>;
  onTransferRedeemed: () => void;
}) {
  // Everything else in the URL goes to the server: the coder id and the design's URL parameters
  const { link, transfer, ...urlParams } = search;
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
        transferToken={transfer}
        onTransferRedeemed={onTransferRedeemed}
        homeUrl="/code"
      />
    </div>
  );
}
