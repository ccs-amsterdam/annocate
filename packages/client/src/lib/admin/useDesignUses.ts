import { designItems, designUses, type DesignUses } from "@annotinder/contracts";
import type { ResearcherApi } from "../api/httpResearcherApi";
import { describeVersions } from "../design/versions";
import { useDeploymentQuery, useDesignVersionQuery, useDesignVersionsQuery } from "./queries";

/**
 * What the study's design uses (contracts `designUses`), from the version
 * the editor opens (the draft, else the latest): the study's pages show
 * what it needs (no Units page for questions only). Null while loading.
 */
export function useDesignUses(client: ResearcherApi): DesignUses | null {
  const versionsQuery = useDesignVersionsQuery(client);
  const deploymentQuery = useDeploymentQuery(client);
  const { currentId } = describeVersions(versionsQuery.data ?? [], deploymentQuery.data?.designVersionId ?? null);
  const current = useDesignVersionQuery(client, currentId);
  if (!versionsQuery.data) return null;
  if (currentId === null) return { content: "both", experiment: false };
  if (!current.data) return null;
  return designUses(
    designItems({ items: current.data.items, session: current.data.session, public: current.data.public }),
  );
}
