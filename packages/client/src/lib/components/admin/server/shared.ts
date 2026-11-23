import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Limits } from "@annotinder/contracts";
import type { ServerApi } from "../../../api/serverApi";
import { ResearcherApiError } from "../../../api/httpResearcherApi";

// Shared by the server admin's pages (ServerAdmin.tsx).

export const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-xs";

/** A user's or plan's limits, as the forms list them. */
export const LIMITS: { key: keyof Limits; label: string }[] = [
  { key: "studies", label: "Studies" },
  { key: "unitsPerStudy", label: "Units per study" },
  { key: "units", label: "Units in all studies" },
  { key: "codersPerStudy", label: "Coders per study" },
  { key: "answersPerStudy", label: "Answers per study" },
];

export const errorText = (e: unknown) =>
  e instanceof ResearcherApiError ? e.reason : e instanceof Error ? e.message : String(e);
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
