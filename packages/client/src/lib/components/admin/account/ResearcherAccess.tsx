import { useEffect, useRef, useState } from "react";
import type { MeResponse } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ServerApi } from "../../../api/serverApi";
import { ResearcherApiError } from "../../../api/httpResearcherApi";
import { formatWhen } from "../../../admin/format";
import { HelpButton } from "../../../help/HelpButton";

/** A researcher invite link's secret in this page's URL (`?researcherInvite=`), if any. */
function inviteFromUrl(): string | null {
  return typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("researcherInvite");
}

function dropInviteFromUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("researcherInvite");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

/**
 * The account part of the jobs page (docs/accounts.md): a user who isn't a
 * researcher yet sees how to become one (a request, or an invite link they
 * opened); a researcher sees what they use of their limits.
 */
export function ResearcherAccess({ server, me, onMe }: { server: ServerApi; me: MeResponse; onMe: (me: MeResponse) => void }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const redeemed = useRef(false);

  // An invite link: redeemed once the user is logged in (here).
  useEffect(() => {
    const secret = inviteFromUrl();
    if (!secret || redeemed.current) return;
    redeemed.current = true;
    server
      .redeemResearcherInvite(secret)
      .then((next) => {
        onMe(next);
        setNotice({ ok: true, text: "Welcome: you are a researcher on this server now, and can create jobs." });
      })
      .catch((e: unknown) => setNotice({ ok: false, text: e instanceof ResearcherApiError ? e.reason : String(e) }))
      .finally(dropInviteFromUrl);
  }, [server, onMe]);

  const noticeLine = notice && (
    <p className={`rounded-md p-3 text-sm ${notice.ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>{notice.text}</p>
  );

  if (me.role !== "user") {
    const { jobs, units } = me.limits;
    const parts = [
      jobs != null && `${me.usage.jobs} of ${jobs} jobs`,
      units != null && `${me.usage.units.toLocaleString()} of ${units.toLocaleString()} units`,
    ].filter(Boolean);
    return (
      <>
        {noticeLine}
        {parts.length > 0 && <p className="text-xs text-muted-foreground">You own {parts.join(" and ")}.</p>}
      </>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      {noticeLine}
      <h2 className="flex items-center gap-1.5 font-medium">
        Creating jobs needs a researcher account <HelpButton topic="accounts" label="Help: accounts" />
      </h2>
      <p className="text-sm text-muted-foreground">
        You can code, and work on jobs that researchers shared with you (they appear below). To create your own jobs, become a
        researcher: with an invite link from this server&apos;s admins{me.canRequestResearcher ? ", or by asking here" : ""}.
      </p>
      {me.researcherRequest ? (
        <p className="text-sm">You asked {formatWhen(me.researcherRequest.at)}. An admin will look at it.</p>
      ) : (
        me.canRequestResearcher && (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              server
                .requestResearcher(message)
                .then(onMe)
                .catch((err: unknown) => setNotice({ ok: false, text: err instanceof ResearcherApiError ? err.reason : String(err) }))
                .finally(() => setBusy(false));
            }}
          >
            <Textarea
              rows={2}
              placeholder="Who you are and what for (e.g. PhD student at the UvA, coding news articles)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <Button type="submit" className="w-fit" disabled={busy}>
              Ask for a researcher account
            </Button>
          </form>
        )
      )}
    </section>
  );
}
