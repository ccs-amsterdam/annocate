import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import type {
  CoderUnits,
  ResultsAgreement,
  ResultsAnswers,
  ResultsCoders,
  ResultsUnit,
  ResultsUnits,
  DesignVersionMeta,
  DeploymentVersion,
  PendingChanges,
  CoderDeletion,
  DesignVersion,
  DesignWrite,
  LinkResponse,
  CoderProgress,
  CoderList,
  CoderPatch,
  CoderResponse,
  CodersCreate,
  CodersCreated,
  DeleteCoders,
  StudyUser,
  StudyUserResponse,
  ResetAnnotations,
  UnitResponse,
  DeploymentResponse,
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
import { ResearcherApiError, type ResearcherApi } from "../api/httpResearcherApi";
import { whoCodes, type WhoCodes } from "./whoCodes";

// TanStack Query hooks over `ResearcherApi` for the researcher UI
// (docs/client.md §7). Each hook takes the API client as an argument, not
// from context: only a `QueryClientProvider` is needed (AdminApp.tsx has one).
// Query keys share prefixes, so invalidating a study's key refreshes all of it.

const keys = {
  studies: ["admin", "studies"] as const,
  examples: ["admin", "examples"] as const,
  study: (id?: number) => ["admin", "study", id ?? "current"] as const,
  studyUsers: (id: number) => ["admin", "study", id, "users"] as const,
  designVersions: (studyId?: number) => ["admin", "study", studyId ?? "current", "designVersions"] as const,
  designVersion: (studyId: number | undefined, id: number) =>
    ["admin", "study", studyId ?? "current", "designVersion", id] as const,
  // Fields and pages share the units prefix: invalidating units refreshes them too
  units: (studyId?: number) => ["admin", "study", studyId ?? "current", "units"] as const,
  unitFields: (studyId?: number) => ["admin", "study", studyId ?? "current", "units", "fields"] as const,
  unitPages: (studyId?: number) => ["admin", "study", studyId ?? "current", "units", "page"] as const,
  sets: (studyId?: number) => ["admin", "study", studyId ?? "current", "sets"] as const,
  coders: (studyId?: number) => ["admin", "study", studyId ?? "current", "coders"] as const,
  sessions: (studyId?: number) => ["admin", "study", studyId ?? "current", "sessions"] as const,
  coderDeletions: (studyId?: number) => ["admin", "study", studyId ?? "current", "coders", "deletions"] as const,
  deployment: (studyId?: number) => ["admin", "study", studyId ?? "current", "deployment"] as const,
  pending: (studyId?: number) => ["admin", "study", studyId ?? "current", "deployment", "pending"] as const,
  deploymentVersions: (studyId?: number) => ["admin", "study", studyId ?? "current", "deployment", "versions"] as const,
  links: (studyId?: number) => ["admin", "study", studyId ?? "current", "links"] as const,
  overview: (studyId?: number) => ["admin", "study", studyId ?? "current", "overview"] as const,
  results: (studyId: number | undefined, view: string) =>
    ["admin", "study", studyId ?? "current", "results", view] as const,
};

export function useStudiesQuery(client: ResearcherApi): UseQueryResult<StudyResponse[]> {
  return useQuery({ queryKey: keys.studies, queryFn: () => client.listStudies() });
}

export function useStudyQuery(client: ResearcherApi, id?: number): UseQueryResult<StudyResponse | null> {
  const targetId = id ?? client.studyId;
  return useQuery({
    queryKey: keys.study(targetId),
    queryFn: () => client.getStudy(targetId),
    // No access (or another refusal) won't change by asking again: only a server or network error is retried
    retry: (count, err) => count < 2 && !(err instanceof ResearcherApiError && err.status < 500),
  });
}

/** Creating a study (from scratch, an example or a recipe): cache it, and refresh the study list. */
function useNewStudyMutation<V>(mutationFn: (vars: V) => Promise<StudyResponse>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (study: StudyResponse) => {
      queryClient.setQueryData(keys.study(study.id), study);
      void queryClient.invalidateQueries({ queryKey: keys.studies });
    },
  });
}

export function useCreateStudyMutation(client: ResearcherApi): UseMutationResult<StudyResponse, Error, StudyWrite> {
  return useNewStudyMutation((body: StudyWrite) => client.createStudy(body));
}

/** The example studies (they don't change while the server runs). */
export function useExamplesQuery(client: ResearcherApi, enabled = true): UseQueryResult<ExampleSummary[]> {
  return useQuery({ queryKey: keys.examples, queryFn: () => client.listExamples(), staleTime: Infinity, enabled });
}

export function useCreateStudyFromExampleMutation(
  client: ResearcherApi,
): UseMutationResult<StudyResponse, Error, StudyFromExample> {
  return useNewStudyMutation((body: StudyFromExample) => client.createStudyFromExample(body));
}

export function useCreateStudyFromRecipeMutation(
  client: ResearcherApi,
): UseMutationResult<StudyResponse, Error, RecipeInput> {
  return useNewStudyMutation((body: RecipeInput) => client.createStudyFromRecipe(body));
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

/** Deletes a study; `confirm` is its name, as the researcher typed it. */
export function useDeleteStudyMutation(
  client: ResearcherApi,
): UseMutationResult<void, Error, { id: number; confirm: string }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirm }) => client.deleteStudy(id, confirm),
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

/**
 * Who codes in the study (admin/whoCodes.ts): the kind its first deploy
 * fixed, before that the kind its draft (latest) design invites. Undefined
 * until the study, and before the first deploy its design, are read.
 */
export function useWhoCodes(client: ResearcherApi): WhoCodes | undefined {
  const study = useStudyQuery(client).data;
  const versions = useDesignVersionsQuery(client).data;
  const latestId = versions?.at(-1)?.id ?? null;
  const latest = useDesignVersionQuery(client, study?.coderKind === null ? latestId : null).data;
  if (!study) return undefined;
  if (study.coderKind !== null) return whoCodes(study, null);
  if (!versions || (latestId !== null && !latest)) return undefined;
  return whoCodes(study, latest);
}

export function useCreateDesignVersionMutation(
  client: ResearcherApi,
): UseMutationResult<DesignVersion, Error, DesignWrite> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: DesignWrite) => client.createDesignVersion(body),
    onSuccess: (version) => {
      queryClient.setQueryData(keys.designVersion(client.studyId, version.id), version);
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
    onSuccess: (version) => {
      queryClient.setQueryData(keys.designVersion(client.studyId, version.id), version);
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

/** Replaces the design's unit fields (removed fields leave the draft units, and the draft design version may be new). */
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
  query: { offset: number; limit: number; column?: string; set?: string },
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
    // New fields go into the design: possibly a new draft design version
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.units(client.studyId) }),
        queryClient.invalidateQueries({ queryKey: keys.coders(client.studyId) }),
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
        queryClient.invalidateQueries({ queryKey: keys.coders(client.studyId) }),
        queryClient.invalidateQueries({ queryKey: keys.sets(client.studyId) }),
        queryClient.invalidateQueries({ queryKey: keys.overview(client.studyId) }),
        queryClient.invalidateQueries({ queryKey: keys.pending(client.studyId) }),
      ]),
  });
}

/** The draft's set groups, or (`live`) the deployed ones. */
export function useSetGroupsQuery(client: ResearcherApi, live = false): UseQueryResult<SetGroupResponse[]> {
  return useQuery({
    queryKey: [...keys.sets(client.studyId), live ? "live" : "draft"],
    queryFn: () => client.listSetGroups(live),
  });
}

/** Changing the draft's sets changes what deploying would change, and the overview. */
function useSetGroupMutation<T, V>(client: ResearcherApi, mutationFn: (vars: V) => Promise<T>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.sets(client.studyId) }),
        // The coders' units in the draft
        queryClient.invalidateQueries({ queryKey: keys.coders(client.studyId) }),
        // A new column with a role is also a unit field (declared on the latest design version)
        queryClient.invalidateQueries({ queryKey: keys.unitFields(client.studyId) }),
        queryClient.invalidateQueries({ queryKey: keys.pending(client.studyId) }),
        queryClient.invalidateQueries({ queryKey: keys.overview(client.studyId) }),
      ]),
  });
}

export function usePutSetGroupMutation(
  client: ResearcherApi,
): UseMutationResult<SetGroupResponse, Error, { group: string; body: SetGroupWrite }> {
  return useSetGroupMutation(client, ({ group, body }: { group: string; body: SetGroupWrite }) =>
    client.putSetGroup(group, body),
  );
}

export function useDeleteSetGroupMutation(client: ResearcherApi): UseMutationResult<void, Error, string> {
  return useSetGroupMutation(client, (group: string) => client.deleteSetGroup(group));
}

/** The coder sessions with their progress; kept up to date (every 10 seconds) unless `poll` is false. */
export function useSessionsQuery(
  client: ResearcherApi,
  { enabled = true, poll = true }: { enabled?: boolean; poll?: boolean } = {},
): UseQueryResult<CoderProgress[]> {
  return useQuery({
    queryKey: keys.sessions(client.studyId),
    queryFn: () => client.listSessions(),
    refetchInterval: poll ? 10_000 : false,
    enabled,
  });
}

/** The study's coders with their units, and the units no expert coder has; `poll`: kept up to date (every 10 seconds). */
export function useCodersQuery(
  client: ResearcherApi,
  { poll = false }: { poll?: boolean } = {},
): UseQueryResult<CoderList> {
  return useQuery({
    queryKey: keys.coders(client.studyId),
    queryFn: () => client.listCoders(),
    refetchInterval: poll ? 10_000 : false,
  });
}

/** Making expert coders and changing a coder's email address; both refresh the coders. */
export function useCoderMutations(client: ResearcherApi): {
  create: UseMutationResult<CodersCreated, Error, CodersCreate>;
  update: UseMutationResult<CoderResponse, Error, { coder: string; body: CoderPatch }>;
} {
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: keys.coders(client.studyId) });
  return {
    create: useMutation({ mutationFn: (body: CodersCreate) => client.createCoders(body), onSuccess }),
    update: useMutation({
      mutationFn: ({ coder, body }: { coder: string; body: CoderPatch }) => client.updateCoder(coder, body),
      onSuccess,
    }),
  };
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
    postpone: useMutation({ mutationFn: (sessionId: number) => client.postponeDeletion(sessionId), onSuccess }),
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

export function useRevokeLinkMutation(client: ResearcherApi) {
  return useLinkMutation(client, (id: number) => client.revokeLink(id));
}

export function useReopenLinkMutation(client: ResearcherApi) {
  return useLinkMutation(client, (id: number) => client.reopenLink(id));
}

export function useRenewLinkSecretMutation(client: ResearcherApi) {
  return useLinkMutation(client, (id: number) => client.renewLinkSecret(id));
}

export function useOverviewQuery(client: ResearcherApi): UseQueryResult<StudyOverview> {
  return useQuery({
    queryKey: keys.overview(client.studyId),
    queryFn: () => client.getOverview(),
    refetchInterval: 30_000,
  });
}

/** What deploying the drafts would change (docs/architecture.md §8.4). */
export function usePendingChangesQuery(client: ResearcherApi, enabled = true): UseQueryResult<PendingChanges> {
  return useQuery({ queryKey: keys.pending(client.studyId), queryFn: () => client.getPendingChanges(), enabled });
}

/** The deployed versions, newest first. */
export function useDeploymentVersionsQuery(client: ResearcherApi, enabled = true): UseQueryResult<DeploymentVersion[]> {
  return useQuery({
    queryKey: keys.deploymentVersions(client.studyId),
    queryFn: () => client.listDeploymentVersions(),
    enabled,
  });
}

/** The live design version; null if the study was never deployed. */
export function useDeploymentQuery(client: ResearcherApi): UseQueryResult<DeploymentResponse | null> {
  return useQuery({ queryKey: keys.deployment(client.studyId), queryFn: () => client.getDeployment() });
}

/** The study's users and their roles (ADMIN only: others get an error). */
export function useStudyUsersQuery(client: ResearcherApi): UseQueryResult<StudyUserResponse[]> {
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

/** Pauses (no new units for coders) or resumes the live study, keeping its design. */
export function useDeploymentActiveMutation(
  client: ResearcherApi,
): UseMutationResult<DeploymentResponse, Error, { designVersionId: number; active: boolean }> {
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
export function useResetAnswersMutation(
  client: ResearcherApi,
): UseMutationResult<{ retired: number }, Error, ResetAnnotations> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ResetAnnotations) => client.resetAnnotations(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.study(client.studyId) }),
  });
}

/** One unit with its data. */
export function useUnitQuery(client: ResearcherApi, id: number | null): UseQueryResult<UnitResponse> {
  return useQuery({
    queryKey: [...keys.units(client.studyId), "one", id],
    queryFn: () => client.getUnit(id!),
    enabled: id !== null,
  });
}

/** What to deploy: a design version (the deployed one: keep it), and whether the draft units and sets too (default: not). */
interface DeployVars {
  designVersionId: number;
  units?: boolean;
  confirmLinks?: boolean;
  /** What returning coders who got new units are told; left out: unchanged. */
  newUnitsMessage?: string | null;
}

/**
 * `PUT /deployment`, keeping whether the study is live or paused as the
 * server has it now (asked, not taken from what this browser has loaded: a
 * deploy must not resume a study that was paused). A first deploy is live.
 */
export async function deployStudy(
  client: Pick<ResearcherApi, "studyId" | "getDeployment" | "putDeployment">,
  queryClient: QueryClient,
  { designVersionId, confirmLinks, units = false, newUnitsMessage }: DeployVars,
): Promise<DeploymentResponse> {
  const current = await queryClient.fetchQuery({
    queryKey: keys.deployment(client.studyId),
    queryFn: () => client.getDeployment(),
  });
  return client.putDeployment({
    designVersionId,
    units,
    active: current ? current.active : true,
    ...(confirmLinks ? { confirmLinks } : {}),
    ...(newUnitsMessage !== undefined ? { newUnitsMessage } : {}),
  });
}

/**
 * Deploys (`PUT /deployment`, docs/architecture.md §8.4) a design version,
 * and optionally the draft units, keeping the study's active/paused state.
 * With many links (contracts CONFIRM_LINKS) the server asks to confirm (409
 * `confirm_links`): deploy again with `confirmLinks`. The deployed version
 * becomes read only, so the design versions are refetched too.
 */
function useDeployMutation(client: ResearcherApi): UseMutationResult<DeploymentResponse, Error, number | DeployVars> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: number | DeployVars) =>
      deployStudy(client, queryClient, typeof vars === "number" ? { designVersionId: vars } : vars),
    onSuccess: (deployment) => {
      queryClient.setQueryData(keys.deployment(client.studyId), deployment);
      void queryClient.invalidateQueries({ queryKey: keys.pending(client.studyId) });
      void queryClient.invalidateQueries({ queryKey: keys.deploymentVersions(client.studyId) });
      void queryClient.invalidateQueries({ queryKey: keys.overview(client.studyId) });
      void queryClient.invalidateQueries({ queryKey: keys.links(client.studyId) });
      void queryClient.invalidateQueries({ queryKey: keys.sets(client.studyId) });
      // The coders' deployed units (and a crowd's first deploy deletes leftover expert coders)
      void queryClient.invalidateQueries({ queryKey: keys.coders(client.studyId) });
      // The first deploy records who codes (the study's coderKind)
      void queryClient.invalidateQueries({ queryKey: keys.study(client.studyId), exact: true });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "study", client.studyId ?? "current", "designVersion"],
      });
      return queryClient.invalidateQueries({ queryKey: keys.designVersions(client.studyId) });
    },
  });
}

/**
 * Deploys like `useDeployMutation`; when the server asks to confirm many
 * links (409 `confirm_links`), asks the researcher and deploys again.
 */
export function useConfirmedDeploy(client: ResearcherApi): (vars: DeployVars) => Promise<DeploymentResponse> {
  const deploy = useDeployMutation(client);
  return async (vars) => {
    try {
      return await deploy.mutateAsync(vars);
    } catch (err) {
      if (!(err instanceof ResearcherApiError && err.code === "confirm_links") || !confirm(err.reason)) throw err;
      return deploy.mutateAsync({ ...vars, confirmLinks: true });
    }
  };
}

/** How coders answered each question so far. Loaded once; the Results page's Refresh asks again. */
export function useResultsAnswersQuery(client: ResearcherApi): UseQueryResult<ResultsAnswers> {
  return useQuery({
    queryKey: keys.results(client.studyId, "answers"),
    queryFn: () => client.getResultsAnswers(),
    staleTime: Infinity,
  });
}

/** Agreement per unit-loop question so far. Loaded once; Refresh asks again. */
export function useResultsAgreementQuery(client: ResearcherApi): UseQueryResult<ResultsAgreement> {
  return useQuery({
    queryKey: keys.results(client.studyId, "agreement"),
    queryFn: () => client.getResultsAgreement(),
    staleTime: Infinity,
  });
}

/** Units two or more coders answered, most disagreement first. Loaded once; Refresh asks again. */
export function useResultUnitsQuery(client: ResearcherApi): UseQueryResult<ResultsUnits> {
  return useQuery({
    queryKey: keys.results(client.studyId, "units"),
    queryFn: () => client.listResultUnits(),
    staleTime: Infinity,
  });
}

/** One unit's answers (under the results key: Refresh asks again). */
export function useResultUnitQuery(client: ResearcherApi, unitId: number | null): UseQueryResult<ResultsUnit> {
  return useQuery({
    queryKey: [...keys.results(client.studyId, "unit"), unitId],
    queryFn: () => client.getResultUnit(unitId!),
    enabled: unitId !== null,
    staleTime: Infinity,
  });
}

/** Per coder session: units, time per unit, practice tries. Loaded once; Refresh asks again. */
export function useResultCodersQuery(client: ResearcherApi): UseQueryResult<ResultsCoders> {
  return useQuery({
    queryKey: keys.results(client.studyId, "coders"),
    queryFn: () => client.listResultCoders(),
    staleTime: Infinity,
  });
}

/** Per coder id, the units they were shown or answered (to keep them when dividing units again). */
export function useCoderUnitsQuery(client: ResearcherApi, enabled = true): UseQueryResult<CoderUnits> {
  return useQuery({
    queryKey: [...keys.coders(client.studyId), "units"],
    queryFn: () => client.listCoderUnits(),
    enabled,
  });
}
