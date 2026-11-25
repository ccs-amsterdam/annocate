import { useEffect, useMemo, useState } from "react";
import { redeemTransfer, type CoderSessionScope } from "../../session/coderSession";
import { CodingScreen } from "./CodingScreen";
import { LoadingScreen, SessionNotice } from "./SessionNotice";
import type { StudyRunnerProps } from "./types";

interface GateSession {
  ready: boolean;
  /** Bumped to start over with a fresh coding screen (a new session, or a name picked). */
  generation: number;
  newSession: boolean;
  coderName?: string;
  error: string | null;
}

/**
 * Gets the session ready before coding starts: redeems a transfer link (the
 * server adds this device to the session), and starts a new session on
 * request. The server finds the session by the device cookie, set on the
 * first visit. See docs/coder-identity.md §4.
 */
export function CoderSessionGate(props: StudyRunnerProps) {
  const { baseUrl, linkSecret, transferToken, onTransferRedeemed, newSession = false } = props;
  const scope = useMemo<CoderSessionScope>(() => ({ baseUrl, linkSecret }), [baseUrl, linkSecret]);
  // The page was opened with a transfer link (which is taken out of the URL once redeemed)
  const [joinedByTransfer] = useState(transferToken !== undefined);
  const [session, setSession] = useState<GateSession>(() => ({
    ready: !transferToken,
    generation: 0,
    newSession,
    error: null,
  }));

  useEffect(() => {
    if (!transferToken) return;
    let cancelled = false;
    redeemTransfer(scope, transferToken)
      .then(() => {
        if (cancelled) return;
        setSession((s) => ({ ...s, ready: true }));
        onTransferRedeemed?.();
      })
      .catch((err: unknown) => {
        if (!cancelled) setSession((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
      });
    return () => {
      cancelled = true;
    };
  }, [transferToken, scope, onTransferRedeemed]);

  if (session.error) return <TransferLinkError error={session.error} />;
  if (!session.ready) return <LoadingScreen />;

  // The server moves this device to a new session on the first request.
  const startNewSession = () => setSession((s) => ({ ...s, generation: s.generation + 1, newSession: true }));

  return (
    <CodingScreen
      key={session.generation}
      {...props}
      newSession={session.newSession}
      joinedByTransfer={joinedByTransfer}
      onStartNewSession={startNewSession}
      coderName={session.coderName}
      onPickName={(coderName) => setSession((s) => ({ ...s, generation: s.generation + 1, coderName }))}
    />
  );
}

function TransferLinkError({ error }: { error: string }) {
  return (
    <SessionNotice title="This link can't be used">
      <p>{error}</p>
      <p>
        Links to continue on another device work once and expire after 15 minutes. Make a new one on the device you
        started on.
      </p>
    </SessionNotice>
  );
}
