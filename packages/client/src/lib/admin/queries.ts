import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import type {
  CodebookMeta,
  CodebookResponse,
  CodebookWrite,
  CoderInviteWrite,
  CoderInviteResponse,
  CoderProgress,
  DeploymentResponse,
  DeploymentStatus,
  JobOverview,
  JobResponse,
  JobWrite,
  UnitField,
  UnitMeta,
  UnitPage,
  UnitsCreateBody,
  UnitsetResponse,
  UnitsetWrite,
} from "@annotinder/contracts";
import type { AdminClient } from "../api/httpAdminClient";

/**
 * TanStack Query hooks wrapping `AdminClient` (docs/client.md §7), used
 * by the management UI components under `components/admin/*`. Each hook
 * takes the `AdminClient` instance explicitly rather than via context, so the
 * management UI stays usable as a plain library export without imposing a
 * particular provider structure on host apps beyond a `QueryClientProvider`
 * ancestor (see `AdminApp.tsx`, which supplies its own by default).
 */

export const keys = {
  jobs: ["admin", "jobs"] as const,
  job: (id?: number) => ["admin", "job", id ?? "current"] as const,
  jobUsers: (id: number) => ["admin", "job", id, "users"] as const,
  codebooks: (jobId?: number) => ["admin", "job", jobId ?? "current", "codebooks"] as const,
  codebook: (jobId: number | undefined, id: number) => ["admin", "job", jobId ?? "current", "codebook", id] as const,
  // Fields and pages share the units prefix: invalidating units refreshes them too
  units: (jobId?: number) => ["admin", "job", jobId ?? "current", "units"] as const,
  unitFields: (jobId?: number) => ["admin", "job", jobId ?? "current", "units", "fields"] as const,
  unitPages: (jobId?: number) => ["admin", "job", jobId ?? "current", "units", "page"] as const,
  unitsets: (jobId?: number) => ["admin", "job", jobId ?? "current", "unitsets"] as const,
  coders: (jobId?: number) => ["admin", "job", jobId ?? "current", "coders"] as const,
  deployment: (jobId?: number) => ["admin", "job", jobId ?? "current", "deployment"] as const,
  deploymentStatus: (jobId?: number) => ["admin", "job", jobId ?? "current", "deployment", "status"] as const,
  invites: (jobId?: number) => ["admin", "job", jobId ?? "current", "invites"] as const,
  overview: (jobId?: number) => ["admin", "job", jobId ?? "current", "overview"] as const,
};

export function useJobsQuery(client: AdminClient): UseQueryResult<JobResponse[]> {
  return useQuery({ queryKey: keys.jobs, queryFn: () => client.listJobs() });
}

export function useJobQuery(client: AdminClient, id?: number): UseQueryResult<JobResponse | null> {
  const targetId = id ?? client.jobId;
  return useQuery({
    queryKey: keys.job(targetId),
    queryFn: () => client.getJob(targetId),
  });
}

export function useCreateJobMutation(client: AdminClient): UseMutationResult<JobResponse, Error, JobWrite> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: JobWrite) => client.createJob(body),
    onSuccess: (job) => {
      queryClient.setQueryData(keys.job(job.id), job);
      void queryClient.invalidateQueries({ queryKey: keys.jobs });
    },
  });
}

export function useUpdateJobMutation(
  client: AdminClient,
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

export function useDeleteJobMutation(client: AdminClient): UseMutationResult<void, Error, number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.deleteJob(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.jobs });
    },
  });
}

export function useCodebooksQuery(client: AdminClient): UseQueryResult<CodebookMeta[]> {
  return useQuery({ queryKey: keys.codebooks(client.jobId), queryFn: () => client.listCodebooks() });
}

export function useCodebookQuery(client: AdminClient, id: number | null): UseQueryResult<CodebookResponse> {
  return useQuery({
    queryKey: keys.codebook(client.jobId, id ?? -1),
    queryFn: () => client.getCodebook(id as number),
    enabled: id !== null,
  });
}

export function useCreateCodebookMutation(
  client: AdminClient,
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
  client: AdminClient,
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

export function useDeleteCodebookMutation(client: AdminClient): UseMutationResult<void, Error, number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.deleteCodebook(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.codebooks(client.jobId) }),
  });
}

export function useUnitsQuery(client: AdminClient): UseQueryResult<UnitMeta[]> {
  return useQuery({ queryKey: keys.units(client.jobId), queryFn: () => client.listUnits() });
}

export function useUnitFieldsQuery(client: AdminClient): UseQueryResult<UnitField[]> {
  return useQuery({ queryKey: keys.unitFields(client.jobId), queryFn: () => client.getUnitFields() });
}

export function useUnitPageQuery(
  client: AdminClient,
  query: { offset: number; limit: number; unitset?: string },
): UseQueryResult<UnitPage> {
  return useQuery({
    queryKey: [...keys.unitPages(client.jobId), query],
    queryFn: () => client.listUnitPage(query),
    placeholderData: (previous) => previous,
  });
}

export function useCreateUnitsMutation(client: AdminClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UnitsCreateBody) => client.createUnits(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.units(client.jobId) }),
  });
}

export function useDeleteUnitMutation(client: AdminClient): UseMutationResult<void, Error, number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.deleteUnit(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.units(client.jobId) }),
  });
}

export function useUnitsetsQuery(client: AdminClient): UseQueryResult<UnitsetResponse[]> {
  return useQuery({ queryKey: keys.unitsets(client.jobId), queryFn: () => client.listUnitsets() });
}

export function useCreateUnitsetMutation(
  client: AdminClient,
): UseMutationResult<UnitsetResponse, Error, UnitsetWrite> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UnitsetWrite) => client.createUnitset(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.unitPages(client.jobId) });
      return queryClient.invalidateQueries({ queryKey: keys.unitsets(client.jobId) });
    },
  });
}

export function useUpdateUnitsetMutation(
  client: AdminClient,
): UseMutationResult<UnitsetResponse, Error, { id: number; body: UnitsetWrite }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => client.updateUnitset(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.unitPages(client.jobId) });
      return queryClient.invalidateQueries({ queryKey: keys.unitsets(client.jobId) });
    },
  });
}

export function useDeleteUnitsetMutation(client: AdminClient): UseMutationResult<void, Error, number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.deleteUnitset(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.unitPages(client.jobId) });
      return queryClient.invalidateQueries({ queryKey: keys.unitsets(client.jobId) });
    },
  });
}

export function useCodersQuery(client: AdminClient): UseQueryResult<CoderProgress[]> {
  return useQuery({ queryKey: keys.coders(client.jobId), queryFn: () => client.listCoders(), refetchInterval: 10_000 });
}

export function useInvitesQuery(client: AdminClient): UseQueryResult<CoderInviteResponse[]> {
  return useQuery({ queryKey: keys.invites(client.jobId), queryFn: () => client.listInvites(), refetchInterval: 30_000 });
}

/** Create, revoke or delete an invite; each refreshes the invite list. */
function useInviteMutation<T, V>(client: AdminClient, mutationFn: (vars: V) => Promise<T>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.invites(client.jobId) }),
  });
}

export function useCreateInviteMutation(client: AdminClient) {
  return useInviteMutation(client, (body: CoderInviteWrite) => client.createInvite(body));
}

export function useRevokeInviteMutation(client: AdminClient) {
  return useInviteMutation(client, (id: number) => client.revokeInvite(id));
}

export function useDeleteInviteMutation(client: AdminClient) {
  return useInviteMutation(client, (id: number) => client.deleteInvite(id));
}

export function useOverviewQuery(client: AdminClient): UseQueryResult<JobOverview> {
  return useQuery({ queryKey: keys.overview(client.jobId), queryFn: () => client.getOverview(), refetchInterval: 30_000 });
}

/** The job server's view of the live job; errors (not retried) when it can't be reached. */
export function useDeploymentStatusQuery(client: AdminClient, enabled: boolean): UseQueryResult<DeploymentStatus> {
  return useQuery({
    queryKey: keys.deploymentStatus(client.jobId),
    queryFn: () => client.getDeploymentStatus(),
    enabled,
    retry: false,
    refetchInterval: 30_000,
  });
}

/** The live codebook version; null if the job was never published. */
export function useDeploymentQuery(client: AdminClient): UseQueryResult<DeploymentResponse | null> {
  return useQuery({ queryKey: keys.deployment(client.jobId), queryFn: () => client.getDeployment() });
}

/**
 * Publishes a codebook version (`PUT /deployment`), keeping the job's
 * active/paused state. The published version becomes read only, so the
 * codebooks are refetched too.
 */
export function usePublishMutation(client: AdminClient): UseMutationResult<DeploymentResponse, Error, number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (codebookId: number) => {
      const current = queryClient.getQueryData<DeploymentResponse | null>(keys.deployment(client.jobId));
      return client.putDeployment({ codebookId, active: current?.active ?? true });
    },
    onSuccess: (deployment) => {
      queryClient.setQueryData(keys.deployment(client.jobId), deployment);
      void queryClient.invalidateQueries({ queryKey: ["admin", "job", client.jobId ?? "current", "codebook"] });
      return queryClient.invalidateQueries({ queryKey: keys.codebooks(client.jobId) });
    },
  });
}
