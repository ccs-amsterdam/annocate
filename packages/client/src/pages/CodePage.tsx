import { useEffect } from "react";
import { StudyRunner } from "../lib/components/StudyRunner";
import { rememberStudy } from "../lib/session/studies";

/**
 * Coding (`/code/<deployment>`): the study as coders see it, without the
 * app's header. A coder link adds `?link=<secret>` and the URL parameters
 * the link asks for (a participant id, ...); "Continue on another device"
 * links add `?transfer=<token>`; without either, this device's session for
 * the deployment continues (the device cookie).
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
  // Everything else in the URL goes to the server: the parameters the link takes, and `url_param` auto variables.
  const { link, transfer, ...urlParams } = search;
  // The coder home lists the studies this browser opened (not the link's secret)
  const paramsKey = JSON.stringify(urlParams);
  useEffect(() => {
    rememberStudy({ deployment, params: JSON.parse(paramsKey) as Record<string, string> });
  }, [deployment, paramsKey]);
  return (
    <div className="h-screen overflow-hidden bg-background text-foreground">
      <StudyRunner
        baseUrl={`${apiUrl}/d/${encodeURIComponent(deployment)}`}
        linkSecret={link}
        urlParams={urlParams}
        transferToken={transfer}
        onTransferRedeemed={onTransferRedeemed}
      />
    </div>
  );
}
