import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import type {
  CodebookMeta,
  CoderDeletion,
  CodebookResponse,
  CodebookWrite,
  CoderInviteWrite,
  CoderInviteResponse,
  CoderProgress,
  DeleteCoders,
  JobUser,
  ResetAnnotations,
  UnitResponse,
  DeploymentResponse,
  DeploymentStatus,
  JobOverview,
  JobResponse,
  JobWrite,
  ExampleSummary,
  JobFromExample,
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
  jobs: ["admin", "jobs"] as const,
  examples: ["admin", "examples"] as const,
  job: (id?: number) => ["admin", "job", id ?? "current"] as const,
  jobUsers: (id: number) => ["admin", "job", id, "users"] as const,
  codebooks: (jobId?: number) => ["admin", "job", jobId ?? "current", "codebooks"] as const,
  codebook: (jobId: number | undefined, id: number) => ["admin", "job", jobId ?? "current", "codebook", id] as const,
  // Fields and pages share the units prefix: invalidating units refreshes them too
  units: (jobId?: number) => ["admin", "job", jobId ?? "current", "units"] as const,
  unitFields: (jobId?: number) => ["admin", "job", jobId ?? "current", "units", "fields"] as const,
  unitPages: (jobId?: number) => ["admin", "job", jobId ?? "current", "units", "page"] as const,
  sets: (jobId?: number) => ["admin", "job", jobId ?? "current", "sets"] as const,
  coders: (jobId?: number) => ["admin", "job", jobId ?? "current", "coders"] as const,
  coderDeletions: (jobId?: number) => ["admin", "job", jobId ?? "current", "coders", "deletions"] as const,
  deployment: (jobId?: number) => ["admin", "job", jobId ?? "current", "deployment"] as const,
  deploymentStatus: (jobId?: number) => ["admin", "job", jobId ?? "current", "deployment", "status"] as const,
  invites: (jobId?: number) => ["admin", "job", jobId ?? "current", "invites"] as const,
  overview: (jobId?: number) => ["admin", "job", jobId ?? "current", "overview"] as const,
};

export function useJobsQuery(client: ResearcherApi): UseQueryResult<JobResponse[]> {
  return useQuery({ queryKey: keys.jobs, queryFn: () => client.listJobs() });
}

export function useJobQuery(client: ResearcherApi, id?: number): UseQueryResult<JobResponse | null> {
  const targetId = id ?? client.jobId;
  return useQuery({
    queryKey: keys.job(targetId),
    queryFn: () => client.getJob(targetId),
  });
}

export function useCreateJobMutation(client: ResearcherApi): UseMutationResult<JobResponse, Error, JobWrite> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: JobWrite) => client.createJob(body),
    onSuccess: (job) => {
      queryClient.setQueryData(keys.job(job.id), job);
      void queryClient.invalidateQueries({ queryKey: keys.jobs });
    },
  });
}

/** The example jobs (they don't change while the server runs). */
export function useExamplesQuery(client: ResearcherApi, enabled = true): UseQueryResult<ExampleSummary[]> {
  return useQuery({ queryKey: keys.examples, queryFn: () => client.listExamples(), staleTime: Infinity, enabled });
}

export function useCreateJobFromExampleMutation(client: ResearcherApi): UseMutationResult<JobResponse, Error, JobFromExample> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: JobFromExample) => client.createJobFromExample(body),
    onSuccess: (job) => {
      queryClient.setQueryData(keys.job(job.id), job);
      void queryClient.invalidateQueries({ queryKey: keys.jobs });
    },
  });
}

export function useCreateJobFromRecipeMutation(client: ResearcherApi): UseMutationResult<JobResponse, Error, RecipeInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RecipeInput) => client.createJobFromRecipe(body),
    onSuccess: (job) => {
      queryClient.setQueryData(keys.job(job.id), job);
      void queryClient.invalidateQueries({ queryKey: keys.jobs });
    },
  });
}

export function useUpdateJobMutation(
  client: ResearcherApi,
): UseMutationResult<JobResponse, Error, { id: number; body: JobWrite }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => client.updateJob(id, body),
    onSuccess: (job) => {
      queryClient.setQueryData(keys.job(job.id), job);
      void queryClient.invalidateQueries({ queryKey: keys.jobs });
    },
  });
}

export function useDeleteJobMutation(client: ResearcherApi): UseMutationResult<void, Error, number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.deleteJob(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.jobs });
    },
  });
}

export function useCodebooksQuery(client: ResearcherApi): UseQueryResult<CodebookMeta[]> {
  return useQuery({ queryKey: keys.codebooks(client.jobId), queryFn: () => client.listCodebooks() });
}

export function useCodebookQuery(client: ResearcherApi, id: number | null): UseQueryResult<CodebookResponse> {
  return useQuery({
    queryKey: keys.codebook(client.jobId, id ?? -1),
    queryFn: () => client.getCodebook(id as number),
    enabled: id !== null,
  });
}

export function useCreateCodebookMutation(
  client: ResearcherApi,
): UseMutationResult<CodebookResponse, Error, CodebookWrite> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CodebookWrite) => client.createCodebook(body),
    onSuccess: (codebook) => {
      queryClient.setQueryData(keys.codebook(client.jobId, codebook.id), codebook);
      return queryClient.invalidateQueries({ queryKey: keys.codebooks(client.jobId) });
    },
  });
}

export function useUpdateCodebookMutation(
  client: ResearcherApi,
): UseMutationResult<CodebookResponse, Error, { id: number; body: CodebookWrite }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => client.updateCodebook(id, body),
    onSuccess: (codebook) => {
      queryClient.setQueryData(keys.codebook(client.jobId, codebook.id), codebook);
      void queryClient.invalidateQueries({ queryKey: keys.codebooks(client.jobId) });
    },
  });
}

export function useDeleteCodebookMutation(client: ResearcherApi): UseMutationResult<void, Error, number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.deleteCodebook(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.codebooks(client.jobId) }),
  });
}

export function useUnitsQuery(client: ResearcherApi): UseQueryResult<UnitMeta[]> {
  return useQuery({ queryKey: keys.units(client.jobId), queryFn: () => client.listUnits() });
}

export function useUnitFieldsQuery(client: ResearcherApi): UseQueryResult<UnitField[]> {
  return useQuery({ queryKey: keys.unitFields(client.jobId), queryFn: () => client.getUnitFields() });
}

export function useUnitPageQuery(
  client: ResearcherApi,
  query: { offset: number; limit: number; group?: string; set?: string },
): UseQueryResult<UnitPage> {
  return useQuery({
    queryKey: [...keys.unitPages(client.jobId), query],
    queryFn: () => client.listUnitPage(query),
    placeholderData: (previous) => previous,
  });
}

export function useCreateUnitsMutation(client: ResearcherApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UnitsCreateBody) => client.createUnits(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.units(client.jobId) }),
  });
}

export function useDeleteUnitMutation(client: ResearcherApi): UseMutationResult<void, Error, number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.deleteUnit(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.units(client.jobId) }),
  });
}

export function useSetGroupsQuery(client: ResearcherApi): UseQueryResult<SetGroupResponse[]> {
  return useQuery({ queryKey: keys.sets(client.jobId), queryFn: () => client.listSetGroups() });
}

/** Changing sets changes links (link parameters with a group's sets) and the overview. */
function useSetGroupMutation<T, V>(client: ResearcherApi, mutationFn: (vars: V) => Promise<T>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.sets(client.jobId) }),
        queryClient.invalidateQueries({ queryKey: keys.invites(client.jobId) }),
        queryClient.invalidateQueries({ queryKey: keys.overview(client.jobId) }),
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
  return useQuery({ queryKey: keys.coders(client.jobId), queryFn: () => client.listCoders(), refetchInterval: 10_000 });
}

/** The job's deletion log: coders whose data was deleted. */
export function useCoderDeletionsQuery(client: ResearcherApi): UseQueryResult<CoderDeletion[]> {
  return useQuery({ queryKey: keys.coderDeletions(client.jobId), queryFn: () => client.listCoderDeletions() });
}

/** Delete coders' data, now or later (a deletion request); both refresh the coder list (and the counts on the overview). */
export function useCoderDeletionMutations(client: ResearcherApi) {
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: keys.job(client.jobId) });
  return {
    remove: useMutation({ mutationFn: (select: DeleteCoders) => client.deleteCoders(select), onSuccess }),
    postpone: useMutation({ mutationFn: (coderId: number) => client.postponeDeletion(coderId), onSuccess }),
  };
}

export function useInvitesQuery(client: ResearcherApi): UseQueryResult<CoderInviteResponse[]> {
  return useQuery({ queryKey: keys.invites(client.jobId), queryFn: () => client.listInvites(), refetchInterval: 30_000 });
}

/** Change, revoke or renew a link; each refreshes the link list. */
function useInviteMutation<T, V>(client: ResearcherApi, mutationFn: (vars: V) => Promise<T>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.invites(client.jobId) }),
  });
}

export function useUpdateInviteMutation(client: ResearcherApi) {
  return useInviteMutation(client, ({ id, body }: { id: number; body: CoderInviteWrite }) => client.updateInvite(id, body));
}

export function useRevokeInviteMutation(client: ResearcherApi) {
  return useInviteMutation(client, (id: number) => client.revokeInvite(id));
}

export function useRenewInviteSecretMutation(client: ResearcherApi) {
  return useInviteMutation(client, (id: number) => client.renewInviteSecret(id));
}

export function useOverviewQuery(client: ResearcherApi): UseQueryResult<JobOverview> {
  return useQuery({ queryKey: keys.overview(client.jobId), queryFn: () => client.getOverview(), refetchInterval: 30_000 });
}

/** Progress of the live job; errors are not retried. */
export function useDeploymentStatusQuery(client: ResearcherApi, enabled: boolean): UseQueryResult<DeploymentStatus> {
  return useQuery({
    queryKey: keys.deploymentStatus(client.jobId),
    queryFn: () => client.getDeploymentStatus(),
    enabled,
    retry: false,
    refetchInterval: 30_000,
  });
}

/** The live codebook version; null if the job was never published. */
export function useDeploymentQuery(client: ResearcherApi): UseQueryResult<DeploymentResponse | null> {
  return useQuery({ queryKey: keys.deployment(client.jobId), queryFn: () => client.getDeployment() });
}

/**
 * Publishes a codebook version (`PUT /deployment`), keeping the job's
 * active/paused state. The published version becomes read only, so the
 * codebooks are refetched too.
 */
/** The job's users and their roles (ADMIN only: others get an error). */
export function useJobUsersQuery(client: ResearcherApi): UseQueryResult<JobUser[]> {
  const jobId = client.jobId!;
  return useQuery({ queryKey: keys.jobUsers(jobId), queryFn: () => client.getJobUsers(jobId), retry: false });
}

/** Replaces the job's users (the whole list). */
export function useJobUsersMutation(client: ResearcherApi): UseMutationResult<void, Error, JobUser[]> {
  const queryClient = useQueryClient();
  const jobId = client.jobId!;
  return useMutation({
    mutationFn: (users: JobUser[]) => client.putJobUsers(jobId, users),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.jobUsers(jobId) }),
  });
}

/** Pauses (no new units for coders) or resumes the live job, keeping its codebook. */
export function useDeploymentActiveMutation(client: ResearcherApi): UseMutationResult<DeploymentResponse, Error, { codebookId: number; active: boolean }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => client.putDeployment(body),
    onSuccess: (deployment) => {
      queryClient.setQueryData(keys.deployment(client.jobId), deployment);
      return queryClient.invalidateQueries({ queryKey: keys.job(client.jobId) });
    },
  });
}

/** Retires answers so units are coded again; refreshes everything that counts answers. */
export function useResetAnswersMutation(client: ResearcherApi): UseMutationResult<{ retired: number }, Error, ResetAnnotations> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ResetAnnotations) => client.resetAnnotations(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.job(client.jobId) }),
  });
}

/** One unit with its data. */
export function useUnitQuery(client: ResearcherApi, id: number | null): UseQueryResult<UnitResponse> {
  return useQuery({ queryKey: [...keys.units(client.jobId), "one", id], queryFn: () => client.getUnit(id!), enabled: id !== null });
}

/**
 * Publishes a codebook. With many links (contracts CONFIRM_LINKS) the server
 * asks to confirm (409 `confirm_links`): publish again with `confirmLinks`.
 */
export function usePublishMutation(
  client: ResearcherApi,
): UseMutationResult<DeploymentResponse, Error, number | { codebookId: number; confirmLinks?: boolean }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: number | { codebookId: number; confirmLinks?: boolean }) => {
      const { codebookId, confirmLinks } = typeof vars === "number" ? { codebookId: vars, confirmLinks: undefined } : vars;
      const current = queryClient.getQueryData<DeploymentResponse | null>(keys.deployment(client.jobId));
      return client.putDeployment({ codebookId, active: current?.active ?? true, ...(confirmLinks ? { confirmLinks } : {}) });
    },
    onSuccess: (deployment) => {
      queryClient.setQueryData(keys.deployment(client.jobId), deployment);
      void queryClient.invalidateQueries({ queryKey: keys.invites(client.jobId) });
      void queryClient.invalidateQueries({ queryKey: ["admin", "job", client.jobId ?? "current", "codebook"] });
      return queryClient.invalidateQueries({ queryKey: keys.codebooks(client.jobId) });
    },
  });
}
