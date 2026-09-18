import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import type {
  CodebookMeta,
  CodebookResponse,
  CodebookWrite,
  CoderInviteWrite,
  CoderProgress,
  JobResponse,
  JobWrite,
  UnitMeta,
  UnitsCreateBody,
  UnitsetResponse,
  UnitsetWrite,
} from "@annotinder/contracts";
import type { AdminClient } from "../api/httpAdminClient";

/**
 * TanStack Query hooks wrapping `AdminClient` (design plan §5 Phase 5), used
 * by the management UI components under `components/admin/*`. Each hook
 * takes the `AdminClient` instance explicitly rather than via context, so the
 * management UI stays usable as a plain library export without imposing a
 * particular provider structure on host apps beyond a `QueryClientProvider`
 * ancestor (see `AdminApp.tsx`, which supplies its own by default).
 */

const keys = {
  job: ["admin", "job"] as const,
  jobUsers: (id: number) => ["admin", "job", id, "users"] as const,
  codebooks: ["admin", "codebooks"] as const,
  codebook: (id: number) => ["admin", "codebook", id] as const,
  units: ["admin", "units"] as const,
  unitsets: ["admin", "unitsets"] as const,
  coders: ["admin", "coders"] as const,
};

export function useJobQuery(client: AdminClient): UseQueryResult<JobResponse | null> {
  return useQuery({ queryKey: keys.job, queryFn: () => client.getJob() });
}

export function useCreateJobMutation(client: AdminClient): UseMutationResult<JobResponse, Error, JobWrite> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: JobWrite) => client.createJob(body),
    onSuccess: (job) => queryClient.setQueryData(keys.job, job),
  });
}

export function useUpdateJobMutation(
  client: AdminClient,
): UseMutationResult<JobResponse, Error, { id: number; body: JobWrite }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => client.updateJob(id, body),
    onSuccess: (job) => queryClient.setQueryData(keys.job, job),
  });
}

export function useCodebooksQuery(client: AdminClient): UseQueryResult<CodebookMeta[]> {
  return useQuery({ queryKey: keys.codebooks, queryFn: () => client.listCodebooks() });
}

export function useCodebookQuery(client: AdminClient, id: number | null): UseQueryResult<CodebookResponse> {
  return useQuery({
    queryKey: keys.codebook(id ?? -1),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.codebooks }),
  });
}

export function useUpdateCodebookMutation(
  client: AdminClient,
): UseMutationResult<CodebookResponse, Error, { id: number; body: CodebookWrite }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => client.updateCodebook(id, body),
    onSuccess: (codebook) => {
      queryClient.setQueryData(keys.codebook(codebook.id), codebook);
      void queryClient.invalidateQueries({ queryKey: keys.codebooks });
    },
  });
}

export function useDeleteCodebookMutation(client: AdminClient): UseMutationResult<void, Error, number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.deleteCodebook(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.codebooks }),
  });
}

export function useUnitsQuery(client: AdminClient): UseQueryResult<UnitMeta[]> {
  return useQuery({ queryKey: keys.units, queryFn: () => client.listUnits() });
}

export function useCreateUnitsMutation(client: AdminClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UnitsCreateBody) => client.createUnits(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.units }),
  });
}

export function useDeleteUnitMutation(client: AdminClient): UseMutationResult<void, Error, number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.deleteUnit(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.units }),
  });
}

export function useUnitsetsQuery(client: AdminClient): UseQueryResult<UnitsetResponse[]> {
  return useQuery({ queryKey: keys.unitsets, queryFn: () => client.listUnitsets() });
}

export function useCreateUnitsetMutation(
  client: AdminClient,
): UseMutationResult<UnitsetResponse, Error, UnitsetWrite> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UnitsetWrite) => client.createUnitset(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.unitsets }),
  });
}

export function useUpdateUnitsetMutation(
  client: AdminClient,
): UseMutationResult<UnitsetResponse, Error, { id: number; body: UnitsetWrite }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => client.updateUnitset(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.unitsets }),
  });
}

export function useDeleteUnitsetMutation(client: AdminClient): UseMutationResult<void, Error, number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.deleteUnitset(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.unitsets }),
  });
}

export function useCodersQuery(client: AdminClient): UseQueryResult<CoderProgress[]> {
  return useQuery({ queryKey: keys.coders, queryFn: () => client.listCoders(), refetchInterval: 10_000 });
}

export function useInviteCoderMutation(client: AdminClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CoderInviteWrite) => client.inviteCoder(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.coders }),
  });
}
