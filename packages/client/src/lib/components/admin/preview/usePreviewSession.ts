import { useEffect, useState } from "react";
import type { PreviewSession } from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";

export interface PreviewSessionState {
  /** The preview deployment and its token; null until the server made it. */
  preview: PreviewSession | null;
  creating: boolean;
  error: string | null;
  /** Changes with every reset: the runner's React key. */
  key: string;
  /** The session was reset: the runner starts a new coder instead of continuing the browser's preview session. */
  wasReset: boolean;
  /** Who the preview runs as: a coder, URL parameters' values (as a link's URL would give them). */
  as: Record<string, string>;
  reset: () => void;
  /** Runs the preview as someone else: starts over. */
  previewAs: (key: string, value: string) => void;
}

/**
 * A preview session of the study (`POST /deployment/preview`): made when the
 * page opens and again on every reset, each with a fresh token and so a fresh
 * coder.
 */
export function usePreviewSession(client: ResearcherApi): PreviewSessionState {
  const newKey = () => `preview-${client.studyId}-${Date.now()}`;
  const [key, setKey] = useState(newKey);
  const [preview, setPreview] = useState<PreviewSession | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasReset, setWasReset] = useState(false);
  const [as, setAs] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function create() {
      setCreating(true);
      setError(null);
      try {
        const session = await client.createPreview();
        if (!cancelled) setPreview(session);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setCreating(false);
      }
    }
    void create();
    return () => {
      cancelled = true;
    };
  }, [client, key]);

  const reset = () => {
    setWasReset(true);
    setKey(newKey());
  };
  const previewAs = (name: string, value: string) => {
    setAs((current) => ({ ...current, [name]: value }));
    reset();
  };
  return { preview, creating, error, key, wasReset, as, reset, previewAs };
}
