import { JobRunner } from "../lib/components/JobRunner";

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
  return (
    <div className="h-screen overflow-hidden bg-background text-foreground">
      <JobRunner
        baseUrl={`${apiUrl}/d/${encodeURIComponent(deployment)}`}
        linkSecret={link}
        urlParams={urlParams}
        transferToken={transfer}
        onTransferRedeemed={onTransferRedeemed}
      />
    </div>
  );
}
