import { useEffect, useState } from "react";
import type { OAuthRequestInfo } from "@annotinder/contracts";
import { Bot, ShieldCheck } from "lucide-react";
import type { ResearcherApi } from "../lib/api/httpResearcherApi";
import { Button } from "@/components/ui/button";

/**
 * The consent page (docs/api/mcp.md): an AI assistant asks to read and edit
 * a study's design. The researcher, logged in, picks one study they may
 * edit and allows it (with a recent second factor: the API asks for a new
 * login if needed), or denies it. Either way the browser goes back to the
 * assistant.
 */
export function ConnectPage({ client, requestId }: { client: ResearcherApi; requestId: string }) {
  const [info, setInfo] = useState<OAuthRequestInfo | null>(null);
  const [failed, setError] = useState<string | null>(null);
  const error = requestId ? failed : "This page opens when an AI assistant asks to connect: start from the assistant.";
  const [studyId, setStudyId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!requestId) return;
    client
      .getOAuthRequest(requestId)
      .then((loaded) => {
        setInfo(loaded);
        if (loaded.studies.length === 1) setStudyId(loaded.studies[0].id);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [client, requestId]);

  async function decide(allow: boolean) {
    setBusy(true);
    setError(null);
    try {
      const { redirectTo } = allow ? await client.approveOAuthRequest(requestId, studyId!) : await client.denyOAuthRequest(requestId);
      window.location.assign(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const edits = info?.scopes.includes("design:edit") ?? false;
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5 p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-leaf/15 text-leaf-strong">
          <Bot className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-heading text-xl font-bold">Connect an AI assistant</h1>
          {info && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{info.client.name}</span> wants to {edits ? "read and edit" : "read"} a study's
              design.
            </p>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {info && (
        <>
          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            <p className="font-medium">It will be able to</p>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              <li>read the study's design: its questions, layouts, session and unit fields, and a few example units</li>
              {edits && <li>save changes to the design as a draft</li>}
            </ul>
            <p className="mt-3 font-medium">It can't</p>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              <li>deploy: coders keep the live version until you deploy the draft yourself</li>
              <li>see answers or coders, or change anything else</li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Client: {info.client.uri ?? info.client.clientId} · returns to {info.client.redirectHost}
            </p>
          </div>

          {info.studies.length === 0 ? (
            <p className="text-sm text-muted-foreground">You have no studies you may edit, so there is nothing to connect.</p>
          ) : (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-sm font-medium">For which study?</legend>
              {info.studies.map((s) => (
                <label
                  key={s.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${studyId === s.id ? "border-wood/60 bg-wood/10" : "border-border bg-card hover:border-wood/40"}`}
                >
                  <input type="radio" name="study" checked={studyId === s.id} onChange={() => setStudyId(s.id)} />
                  {s.name}
                </label>
              ))}
            </fieldset>
          )}

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            Only allow assistants you trust. You can disconnect it at any time under your account menu, Connected assistants.
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => void decide(false)}>
              Deny
            </Button>
            <Button disabled={busy || studyId === null} onClick={() => void decide(true)}>
              Allow
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
