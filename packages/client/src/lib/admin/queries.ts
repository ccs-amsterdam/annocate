import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import type {
  DesignVersionMeta,
  DeploymentVersion,
  PendingChanges,
  CoderDeletion,
  DesignVersion,
  DesignWrite,
  LinkWrite,
  LinkResponse,
  CoderProgress,
  DeleteCoders,
  StudyUser,
  ResetAnnotations,
  UnitResponse,
  DeploymentResponse,
  DeploymentStatus,
  StudyOverview,
  StudyResponse,
  StudyWrite,
  ExampleSummary,
  StudyFromExample,
  RecipeInput,
  UnitField,
  UnitMeta,
  UnitPage,
  UnitsCreateBody,
  SetGroupResponse,
  SetGroupWrite,
} from "@annotinder/contracts";
import type { ResearcherApi } from "../api/httpResearcherApi";

/**
 * TanStack Query hooks wrapping `ResearcherApi` (docs/client.md §7), used
 * by the management UI components under `components/admin/*`. Each hook
 * takes the `ResearcherApi` instance explicitly rather than via context, so the
 * management UI stays usable as a plain library export without imposing a
 * particular provider structure on host apps beyond a `QueryClientProvider`
 * ancestor (see `AdminApp.tsx`, which supplies its own by default).
 */

export const keys = {
  studies: ["admin", "studies"] as const,
  examples: ["admin", "examples"] as const,
  study: (id?: number) => ["admin", "study", id ?? "current"] as const,
  studyUsers: (id: number) => ["admin", "study", id, "users"] as const,
  designVersions: (studyId?: number) => ["admin", "study", studyId ?? "current", "designVersions"] as const,
  designVersion: (studyId: number | undefined, id: number) => ["admin", "study", studyId ?? "current", "designVersion", id] as const,
  // Fields and pages share the units prefix: invalidating units refreshes them too
  units: (studyId?: number) => ["admin", "study", studyId ?? "current", "units"] as const,
  unitFields: (studyId?: number) => ["admin", "study", studyId ?? "current", "units", "fields"] as const,
  unitPages: (studyId?: number) => ["admin", "study", studyId ?? "current", "units", "page"] as const,
  sets: (studyId?: number) => ["admin", "study", studyId ?? "current", "sets"] as const,
  coders: (studyId?: number) => ["admin", "study", studyId ?? "current", "coders"] as const,
  coderDeletions: (studyId?: number) => ["admin", "study", studyId ?? "current", "coders", "deletions"] as const,
  deployment: (studyId?: number) => ["admin", "study", studyId ?? "current", "deployment"] as const,
  deploymentStatus: (studyId?: number) => ["admin", "study", studyId ?? "current", "deployment", "status"] as const,
  pending: (studyId?: number) => ["admin", "study", studyId ?? "current", "deployment", "pending"] as const,
  deploymentVersions: (studyId?: number) => ["admin", "study", studyId ?? "current", "deployment", "versions"] as const,
  links: (studyId?: number) => ["admin", "study", studyId ?? "current", "links"] as const,
  overview: (studyId?: number) => ["admin", "study", studyId ?? "current", "overview"] as const,
};

export function useStudiesQuery(client: ResearcherApi): UseQueryResult<StudyResponse[]> {
  return useQuery({ queryKey: keys.studies, queryFn: () => client.listStudies() });
}

export function useStudyQuery(client: ResearcherApi, id?: number): UseQueryResult<StudyResponse | null> {
  const targetId = id ?? client.studyId;
  return useQuery({
    queryKey: keys.study(targetId),
    queryFn: () => client.getStudy(targetId),
  });
}

export function useCreateStudyMutation(client: ResearcherApi): UseMutationResult<StudyResponse, Error, StudyWrite> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: StudyWrite) => client.createStudy(body),
    onSuccess: (study) => {
      queryClient.setQueryData(keys.study(study.id), study);
      void queryClient.invalidateQueries({ queryKey: keys.studies });
    },
  });
}

/** The example studies (they don't change while the server runs). */
export function useExamplesQuery(client: ResearcherApi, enabled = true): UseQueryResult<ExampleSummary[]> {
  return useQuery({ queryKey: keys.examples, queryFn: () => client.listExamples(), staleTime: Infinity, enabled });
}

export function useCreateStudyFromExampleMutation(client: ResearcherApi): UseMutationResult<StudyResponse, Error, StudyFromExample> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: StudyFromExample) => client.createStudyFromExample(body),
    onSuccess: (study) => {
      queryClient.setQueryData(keys.study(study.id), study);
      void queryClient.invalidateQueries({ queryKey: keys.studies });
    },
  });
}

export function useCreateStudyFromRecipeMutation(client: ResearcherApi): UseMutationResult<StudyResponse, Error, RecipeInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RecipeInput) => client.createStudyFromRecipe(body),
    onSuccess: (study) => {
      queryClient.setQueryData(keys.study(study.id), study);
      void queryClient.invalidateQueries({ queryKey: keys.studies });
    },
  });
}

export function useUpdateStudyMutation(
  client: ResearcherApi,
): UseMutationResult<StudyResponse, Error, { id: number; body: StudyWrite }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => client.updateStudy(id, body),
    onSuccess: (study) => {
      queryClient.setQueryData(keys.study(study.id), study);
      void queryClient.invalidateQueries({ queryKey: keys.studies });
    },
  });
}

export function useDeleteStudyMutation(client: ResearcherApi): UseMutationResult<void, Error, number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.deleteStudy(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.studies });
    },
  });
}

export function useDesignVersionsQuery(client: ResearcherApi): UseQueryResult<DesignVersionMeta[]> {
  return useQuery({ queryKey: keys.designVersions(client.studyId), queryFn: () => client.listDesignVersions() });
}

export function useDesignVersionQuery(client: ResearcherApi, id: number | null): UseQueryResult<DesignVersion> {
  return useQuery({
    queryKey: keys.designVersion(client.studyId, id ?? -1),
    queryFn: () => client.getDesignVersion(id as number),
    enabled: id !== null,
  });
}

export function useCreateDesignVersionMutation(
  client: ResearcherApi,
): UseMutationResult<DesignVersion, Error, DesignWrite> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: DesignWrite) => client.createDesignVersion(body),
    onSuccess: (codebook) => {
      queryClient.setQueryData(keys.designVersion(client.studyId, codebook.id), codebook);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.designVersions(client.studyId) }),
        queryClient.invalidateQueries({ queryKey: keys.pending(client.studyId) }),
      ]);
    },
  });
}

export function useUpdateDesignVersionMutation(
  client: ResearcherApi,
): UseMutationResult<DesignVersion, Error, { id: number; body: DesignWrite }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => client.updateDesignVersion(id, body),
    onSuccess: (codebook) => {
      queryClient.setQueryData(keys.designVersion(client.studyId, codebook.id), codebook);
      void queryClient.invalidateQueries({ queryKey: keys.designVersions(client.studyId) });
      void queryClient.invalidateQueries({ queryKey: keys.pending(client.studyId) });
    },
  });
}

export function useDeleteDesignVersionMutation(client: ResearcherApi): UseMutationResult<void, Error, number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.deleteDesignVersion(id),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.designVersions(client.studyId) }),
        queryClient.invalidateQueries({ queryKey: keys.pending(client.studyId) }),
      ]),
  });
}

export function useUnitsQuery(client: ResearcherApi): UseQueryResult<UnitMeta[]> {
  return useQuery({ queryKey: keys.units(client.studyId), queryFn: () => client.listUnits() });
}

export function useUnitFieldsQuery(client: ResearcherApi): UseQueryResult<UnitField[]> {
  return useQuery({ queryKey: keys.unitFields(client.studyId), queryFn: () => client.getUnitFields() });
}

/** Replaces the design's unit fields (removed fields leave the draft units, and the draft codebook may be new). */
export function useUnitFieldsMutation(client: ResearcherApi): UseMutationResult<UnitField[], Error, UnitField[]> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fields: UnitField[]) => client.putUnitFields(fields),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.units(client.studyId) }),
        queryClient.invalidateQueries({ queryKey: keys.designVersions(client.studyId) }),
        queryClient.invalidateQueries({ queryKey: keys.pending(client.studyId) }),
      ]),
  });
}

export function useUnitPageQuery(
  client: ResearcherApi,
  query: { offset: number; limit: number; group?: string; set?: string },
): UseQueryResult<UnitPage> {
  return useQuery({
    queryKey: [...keys.unitPages(client.studyId), query],
    queryFn: () => client.listUnitPage(query),
    placeholderData: (previous) => previous,
  });
}

export function useCreateUnitsMutation(client: ResearcherApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UnitsCreateBody) => client.createUnits(body),
    // New fields go into the design: possibly a new draft codebook
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.units(client.studyId) }),
        queryClient.invalidateQueries({ queryKey: keys.designVersions(client.studyId) }),
        queryClient.invalidateQueries({ queryKey: keys.pending(client.studyId) }),
      ]),
  });
}

export function useDeleteUnitMutation(client: ResearcherApi): UseMutationResult<void, Error, number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.deleteUnit(id),
    // The unit also leaves the draft's sets
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.units(client.studyId) }),
        queryClient.invalidateQueries({ queryKey: keys.sets(client.studyId) }),
        queryClient.invalidateQueries({ queryKey: keys.overview(client.studyId) }),
        queryClient.invalidateQueries({ queryKey: keys.pending(client.studyId) }),
      ]),
  });
}

/** The draft's set groups, or (`live`) the deployed ones. */
export function useSetGroupsQuery(client: ResearcherApi, live = false): UseQueryResult<SetGroupResponse[]> {
  return useQuery({ queryKey: [...keys.sets(client.studyId), live ? "live" : "draft"], queryFn: () => client.listSetGroups(live) });
}

/** Changing the draft's sets changes what deploying would change, and the overview. */
function useSetGroupMutation<T, V>(client: ResearcherApi, mutationFn: (vars: V) => Promise<T>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.sets(client.studyId) }),
        queryClient.invalidateQueries({ queryKey: keys.pending(client.studyId) }),
        queryClient.invalidateQueries({ queryKey: keys.overview(client.studyId) }),
      ]),
  });
}

export function usePutSetGroupMutation(client: ResearcherApi): UseMutationResult<SetGroupResponse, Error, { group: string; body: SetGroupWrite }> {
  return useSetGroupMutation(client, ({ group, body }: { group: string; body: SetGroupWrite }) => client.putSetGroup(group, body));
}

export function useDeleteSetGroupMutation(client: ResearcherApi): UseMutationResult<void, Error, string> {
  return useSetGroupMutation(client, (group: string) => client.deleteSetGroup(group));
}

export function useCodersQuery(client: ResearcherApi): UseQueryResult<CoderProgress[]> {
  return useQuery({ queryKey: keys.coders(client.studyId), queryFn: () => client.listCoders(), refetchInterval: 10_000 });
}

/** The study's deletion log: coders whose data was deleted. */
export function useCoderDeletionsQuery(client: ResearcherApi): UseQueryResult<CoderDeletion[]> {
  return useQuery({ queryKey: keys.coderDeletions(client.studyId), queryFn: () => client.listCoderDeletions() });
}

/** Delete coders' data, now or later (a deletion request); both refresh the coder list (and the counts on the overview). */
export function useCoderDeletionMutations(client: ResearcherApi) {
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: keys.study(client.studyId) });
  return {
    remove: useMutation({ mutationFn: (select: DeleteCoders) => client.deleteCoders(select), onSuccess }),
    postpone: useMutation({ mutationFn: (coderId: number) => client.postponeDeletion(coderId), onSuccess }),
  };
}

export function useLinksQuery(client: ResearcherApi): UseQueryResult<LinkResponse[]> {
  return useQuery({ queryKey: keys.links(client.studyId), queryFn: () => client.listLinks(), refetchInterval: 30_000 });
}

/** Change, revoke or renew a link; each refreshes the link list. */
function useLinkMutation<T, V>(client: ResearcherApi, mutationFn: (vars: V) => Promise<T>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.links(client.studyId) }),
  });
}

export function useUpdateLinkMutation(client: ResearcherApi) {
  return useLinkMutation(client, ({ id, body }: { id: number; body: LinkWrite }) => client.updateLink(id, body));
}

export function useRevokeLinkMutation(client: ResearcherApi) {
  return useLinkMutation(client, (id: number) => client.revokeLink(id));
}

export function useRenewLinkSecretMutation(client: ResearcherApi) {
  return useLinkMutation(client, (id: number) => client.renewLinkSecret(id));
}

export function useOverviewQuery(client: ResearcherApi): UseQueryResult<StudyOverview> {
  return useQuery({ queryKey: keys.overview(client.studyId), queryFn: () => client.getOverview(), refetchInterval: 30_000 });
}

/** Progress of the live study; errors are not retried. */
export function useDeploymentStatusQuery(client: ResearcherApi, enabled: boolean): UseQueryResult<DeploymentStatus> {
  return useQuery({
    queryKey: keys.deploymentStatus(client.studyId),
    queryFn: () => client.getDeploymentStatus(),
    enabled,
    retry: false,
    refetchInterval: 30_000,
  });
}

/** What deploying the drafts would change (docs/plans/design.md §5). */
export function usePendingChangesQuery(client: ResearcherApi, enabled = true): UseQueryResult<PendingChanges> {
  return useQuery({ queryKey: keys.pending(client.studyId), queryFn: () => client.getPendingChanges(), enabled });
}

/** The deployed versions, newest first. */
export function useDeploymentVersionsQuery(client: ResearcherApi, enabled = true): UseQueryResult<DeploymentVersion[]> {
  return useQuery({ queryKey: keys.deploymentVersions(client.studyId), queryFn: () => client.listDeploymentVersions(), enabled });
}

/** The live design version; null if the study was never deployed. */
export function useDeploymentQuery(client: ResearcherApi): UseQueryResult<DeploymentResponse | null> {
  return useQuery({ queryKey: keys.deployment(client.studyId), queryFn: () => client.getDeployment() });
}

/**
 * Deploys a design version (`PUT /deployment`), keeping the study's
 * active/paused state. The deployed version becomes read only, so the
 * design versions are refetched too.
 */
/** The study's users and their roles (ADMIN only: others get an error). */
export function useStudyUsersQuery(client: ResearcherApi): UseQueryResult<StudyUser[]> {
  const studyId = client.studyId!;
  return useQuery({ queryKey: keys.studyUsers(studyId), queryFn: () => client.getStudyUsers(studyId), retry: false });
}

/** Replaces the study's users (the whole list). */
export function useStudyUsersMutation(client: ResearcherApi): UseMutationResult<void, Error, StudyUser[]> {
  const queryClient = useQueryClient();
  const studyId = client.studyId!;
  return useMutation({
    mutationFn: (users: StudyUser[]) => client.putStudyUsers(studyId, users),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.studyUsers(studyId) }),
  });
}

/** Pauses (no new units for coders) or resumes the live study, keeping its codebook. */
export function useDeploymentActiveMutation(client: ResearcherApi): UseMutationResult<DeploymentResponse, Error, { designVersionId: number; active: boolean }> {
  const queryClient = useQueryClient();
  return useMutation({
    // Keeps the deployed units, and their links (confirmed at deploy): pausing deploys nothing
    mutationFn: (body) => client.putDeployment({ ...body, units: false, confirmLinks: true }),
    onSuccess: (deployment) => {
      queryClient.setQueryData(keys.deployment(client.studyId), deployment);
      return queryClient.invalidateQueries({ queryKey: keys.study(client.studyId) });
    },
  });
}

/** Retires answers so units are coded again; refreshes everything that counts answers. */
export function useResetAnswersMutation(client: ResearcherApi): UseMutationResult<{ retired: number }, Error, ResetAnnotations> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ResetAnnotations) => client.resetAnnotations(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.study(client.studyId) }),
  });
}

/** One unit with its data. */
export function useUnitQuery(client: ResearcherApi, id: number | null): UseQueryResult<UnitResponse> {
  return useQuery({ queryKey: [...keys.units(client.studyId), "one", id], queryFn: () => client.getUnit(id!), enabled: id !== null });
}

/** What to deploy: a codebook (the deployed one: keep it), and the draft units and sets (default) or not. */
export interface DeployVars {
  designVersionId: number;
  units?: boolean;
  confirmLinks?: boolean;
}

/**
 * Deploys (docs/plans/design.md §5): a codebook and the draft units. With
 * many links (contracts CONFIRM_LINKS) the server asks to confirm (409
 * `confirm_links`): deploy again with `confirmLinks`.
 */
export function usePublishMutation(client: ResearcherApi): UseMutationResult<DeploymentResponse, Error, number | DeployVars> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: number | DeployVars) => {
      const { designVersionId, confirmLinks, units = false } = typeof vars === "number" ? { designVersionId: vars } : vars;
      const current = queryClient.getQueryData<DeploymentResponse | null>(keys.deployment(client.studyId));
      return client.putDeployment({ designVersionId, units, active: current?.active ?? true, ...(confirmLinks ? { confirmLinks } : {}) });
    },
    onSuccess: (deployment) => {
      queryClient.setQueryData(keys.deployment(client.studyId), deployment);
      void queryClient.invalidateQueries({ queryKey: keys.pending(client.studyId) });
      void queryClient.invalidateQueries({ queryKey: keys.deploymentVersions(client.studyId) });
      void queryClient.invalidateQueries({ queryKey: keys.overview(client.studyId) });
      void queryClient.invalidateQueries({ queryKey: keys.links(client.studyId) });
      void queryClient.invalidateQueries({ queryKey: keys.sets(client.studyId) });
      void queryClient.invalidateQueries({ queryKey: ["admin", "study", client.studyId ?? "current", "designVersion"] });
      return queryClient.invalidateQueries({ queryKey: keys.designVersions(client.studyId) });
    },
  });
}
