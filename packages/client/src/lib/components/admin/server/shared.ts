import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Limits } from "@annotinder/contracts";
import type { ServerApi } from "../../../api/serverApi";
import { ResearcherApiError } from "../../../api/httpResearcherApi";

// Shared by the server admin's pages (ServerAdmin.tsx).

export const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-xs";

/** The limits that are a most (a number, or none). */
export type CountLimit = Exclude<keyof Limits, "crowdSignIn">;

/** A user's or plan's limits, as the forms list them. */
export const LIMITS: { key: CountLimit; label: string }[] = [
  { key: "studies", label: "Studies" },
  { key: "unitsPerStudy", label: "Units per study" },
  { key: "units", label: "Units in all studies" },
  { key: "codersPerStudy", label: "Coders per study" },
  { key: "answersPerStudy", label: "Answers per study" },
];

export const errorText = (e: unknown) =>
  e instanceof ResearcherApiError ? e.reason : e instanceof Error ? e.message : String(e);
/** Crowd sign-in (`Limits.crowdSignIn`), as the forms call it. */
export const CROWD_SIGN_IN = "Crowd coders can sign in";
export const CROWD_SIGN_IN_ABOUT =
  "In this researcher's studies, a crowd's coders may sign in to continue on other devices (the researchers don't see their address). Off: only expert coders can sign in.";

export const limitText = (v: number | null | undefined) => (v == null ? "no limit" : v.toLocaleString());

/** The plans. */
export function usePlans(server: ServerApi) {
  return useQuery({ queryKey: ["admin", "server", "plans"], queryFn: () => server.listPlans() });
}

/** Refreshes everything on the server admin's page (after a change). */
export function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["admin", "server"] });
}
