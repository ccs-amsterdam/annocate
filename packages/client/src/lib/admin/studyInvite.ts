import { designItems, inviteOf, sessionItem, type Invite } from "@annotinder/contracts";
import type { ResearcherApi } from "../api/httpResearcherApi";
import { describeVersions } from "../design/versions";
import { useDeploymentQuery, useDesignVersionQuery, useDesignVersionsQuery } from "./queries";

/**
 * Who codes as the study's design says now: the draft's choice, else the
 * latest version's (what the researcher is working on, and what the next
 * deploy runs). `ready`: the design was read.
 */
export function useCurrentInvite(client: ResearcherApi): { invite: Invite | null; ready: boolean } {
  const deployment = useDeploymentQuery(client);
  const versionsQuery = useDesignVersionsQuery(client);
  const versions = describeVersions(versionsQuery.data ?? [], deployment.data?.designVersionId ?? null);
  const current = useDesignVersionQuery(client, versions.currentId);
  const loading = deployment.isLoading || versionsQuery.isLoading || (versions.currentId !== null && !current.data);
  return { invite: current.data ? inviteOf(sessionItem(designItems(current.data))) : null, ready: !loading };
}
