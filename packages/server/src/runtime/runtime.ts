import {
  type AnswerTiming,
  CODER_SET,
  sessionItem,
  loginRequired,
  type SubmitUnitResponse,
  type CoderUnitResponse,
  type DeploymentStatus,
  type EndUnit,
  type Reopen,
  type SessionResponse,
  type TransferResponse,
  type TopLevelItem,
  type VariableValue,
  type PickNamesResponse,
  type DisplayEntry,
} from "@annotinder/contracts";
import { HttpError } from "../shared/http.js";
import type { DeviceDetails } from "../shared/devices.js";
import type { Coder, Coding, ResolveCoderRequest, ResolvedCoder } from "./types.js";
import { runtimeInvite, type SessionRules } from "./sessionValues.js";
import { codingsSignature, loopAgreementVariables } from "./designItems.js";
import { agreementKeys, Deployed, DEFAULT_RUNTIME_OPTIONS, type RuntimeOptions } from "./deployed.js";
import { assignCondition } from "./experiments.js";
import { loopUnit } from "./coderUnit.js";
import { nextUnits } from "./picking.js";
import { endSession, quitSession, reopenSession } from "./sessionEnd.js";
import { sessionResponse } from "./sessionView.js";
import { deploymentStatus } from "./status.js";
import { submitCoderVariables, submitUnit } from "./submit.js";
import { createTransfer, redeemTransfer } from "./transfers.js";
import type { Store } from "./store.js";

export { DEFAULT_RUNTIME_OPTIONS, type RuntimeOptions };
export type { Coder };

/**
 * The coder runtime of one deployed study (docs/architecture.md §3).
 * Everything it works with is in the database and read per request: the
 * coder, their answers, units, finished codings (`unit_codings`) and the
 * leases of shared queues (`unit_leases`). Decisions that count other
 * coders (a shared queue's next unit, a balanced draw) run under a
 * database lock (`Store.locked`), so any number of server processes can
 * serve the same study. In memory only the deployment spec (`Deployed`),
 * re-read when its stamp changes.
 *
 * "Finished" is always relative to the current design: every question of
 * the loop has a live value (docs/architecture.md §8.2). Codings are kept
 * per loop, so a unit in two loops is finished in each separately; they
 * are rebuilt from the answers when what finishes a loop changes
 * (`codingsBasis`).
 *
 * This class reads the deployment and keeps it current; what coders do is
 * in the modules next to it: sessionView.ts, experiments.ts, shares.ts,
 * picking.ts, coderUnit.ts, submit.ts, sessionEnd.ts, transfers.ts, and
 * status.ts for the researchers.
 */
export class DeploymentRuntime {
  private deployed: Deployed;
  /** The deployment's stamp when the spec was read (`Store.deploymentStamp`). */
  private stamp: string | null = null;
  private refreshing: Promise<void> | null = null;

  constructor(
    readonly id: string,
    private store: Store,
    options: RuntimeOptions = DEFAULT_RUNTIME_OPTIONS,
  ) {
    this.deployed = new Deployed(id, store, options);
  }

  /** The study this deployment runs (once loaded). */
  get studyId(): number {
    return this.deployed.spec.studyId;
  }

  get version(): number {
    return this.deployed.spec.version;
  }

  // --- state ------------------------------------------------------------------

  /** Reads the deployment, and makes sure the finished codings fit its design. */
  async load(): Promise<void> {
    const stamp = await this.store.deploymentStamp();
    this.deployed.applySpec(await this.store.getDeployment());
    await this.ensureCodings();
    this.stamp = stamp;
  }

  /**
   * Checks the deployment's stamp (one small query, every request), and if
   * it changed re-reads the spec. Single-flight.
   */
  async refresh(): Promise<void> {
    this.refreshing ??= (async () => {
      try {
        const stamp = await this.store.deploymentStamp();
        if (stamp !== null && stamp === this.stamp) return;
        const spec = await this.store.getDeployment();
        const current = this.deployed.spec;
        if (spec.version !== current.version || spec.annotationEpoch !== current.annotationEpoch) {
          this.deployed.applySpec(spec);
          await this.ensureCodings();
        } else {
          this.deployed.applySettings(spec);
        }
        // Only once read: a failed read (e.g. a suspended study) is tried again next time.
        this.stamp = stamp;
      } finally {
        this.refreshing = null;
      }
    })();
    await this.refreshing;
  }

  /** What finishes a loop under this design (its questions and agreement questions), and the annotation epoch. */
  private get codingsBasis(): string {
    return `${codingsSignature(this.deployed.loops.values())}/${this.deployed.spec.annotationEpoch}`;
  }

  /**
   * The stored codings (`unit_codings`) are derived from the answers under a
   * design. If that changed (loops gained questions, other agreement
   * questions) or answers were reset, they are derived again, once: the
   * first process to get the lock does it.
   */
  private async ensureCodings(): Promise<void> {
    const basis = this.codingsBasis;
    const { loops } = this.deployed;
    if ((await this.store.codingsBasis()) === basis) return;
    const rederive = async (store: Store) => {
      if ((await store.codingsBasis()) === basis) return;
      const rows = await store.listFinished({
        loops: [...loops.values()].map((info) => ({
          loop: info.key,
          variables: [...info.variables.keys()],
          values: loopAgreementVariables(info),
        })),
      });
      const codings = rows.flatMap((row): Coding[] => {
        const info = loops.get(row.loop);
        if (!info || row.unitId === null) return [];
        return [
          {
            loop: row.loop,
            unitId: row.unitId,
            sessionId: row.sessionId,
            agreement: agreementKeys(row.values ?? {}, info),
            created: row.created,
            updated: row.created,
          },
        ];
      });
      await store.replaceCodings(basis, codings);
    };
    // Every answer of the study is read and its codings written: long in a large one
    await this.store.locked("codings", rederive, { long: true });
  }

  // --- starting a session -----------------------------------------------------

  /** What the design asks of a new session (its Study entry), and the coders. */
  private get sessionRules(): SessionRules {
    const items = this.deployed.spec.design.items as TopLevelItem[];
    return { item: sessionItem(items), coders: this.deployed.groups.get(CODER_SET) ?? [] };
  }

  /**
   * A pick-your-name link's names: the coders (`coder_set`), and which
   * are taken (where a name is the first device's that picks it).
   */
  async pickNames(): Promise<PickNamesResponse> {
    const invite = runtimeInvite(this.sessionRules.item);
    if (invite.mode !== "coders" || invite.link !== "pick_name")
      throw new HttpError(404, "This link has no names to pick", "link_not_found");
    const taken = new Set<string>();
    if ((invite.nameDevices ?? "first") === "first")
      for (const coder of await this.store.listCoders()) if (coder.session.coder) taken.add(coder.session.coder);
    const names = this.deployed.groups.get(CODER_SET) ?? [];
    return { names: names.map((name) => ({ name, taken: taken.has(name) })) };
  }

  /** Whether the deployed design invites a crowd (the study's kind of coders, fixed by its first deploy). */
  get crowd(): boolean {
    return runtimeInvite(this.sessionRules.item).mode === "crowd";
  }

  /** Whether coders must sign in to start (expert coders who sign in). */
  get loginRequired(): boolean {
    return loginRequired(this.sessionRules.item);
  }

  /** The URL parameter with a crowd's coder id, if any: part of a device's session key. */
  get coderParam(): string | null {
    const invite = runtimeInvite(this.sessionRules.item);
    return invite.mode === "crowd" ? (invite.coderParam?.param ?? null) : null;
  }

  /**
   * The coder for a coder key, created on first use (from the link, with
   * coder id / new-session confirmation, see docs/coder-identity.md).
   * Read from the database on every request: one indexed query.
   */
  resolveCoder(request: ResolveCoderRequest): Promise<ResolvedCoder> {
    const rules = this.sessionRules;
    const loginWanted = request.useLogin || loginRequired(rules.item);
    return this.store.resolveCoder({
      ...request,
      login: loginWanted ? request.login : undefined,
      paused: !this.deployed.spec.active,
      sessionRules: rules,
    });
  }

  // --- what coders do (see each module) ---------------------------------------

  session(coder: Coder): Promise<SessionResponse> {
    return sessionResponse(this.deployed, coder);
  }

  assignCondition(coder: Coder, name: string): Promise<VariableValue> {
    return assignCondition(this.deployed, coder, name);
  }

  nextUnits(coder: Coder, loopName: string, count = 1): Promise<CoderUnitResponse[]> {
    return nextUnits(this.deployed, coder, loopName, count);
  }

  loopUnit(coder: Coder, loopName: string, unitId: number): Promise<CoderUnitResponse> {
    return loopUnit(this.deployed, coder, loopName, unitId);
  }

  submitUnit(
    coder: Coder,
    unitId: number,
    variables: Record<string, VariableValue>,
    loopName?: string,
    deviceId: number | null = null,
    timings: Record<string, AnswerTiming> = {},
  ): Promise<SubmitUnitResponse> {
    return submitUnit(this.deployed, coder, unitId, variables, loopName, deviceId, timings);
  }

  submitCoderVariables(
    coder: Coder,
    variables: Record<string, VariableValue>,
    deviceId: number | null = null,
    timings: Record<string, AnswerTiming> = {},
  ): Promise<void> {
    return submitCoderVariables(this.deployed, coder, variables, deviceId, timings);
  }

  endSession(coder: Coder, item?: string, unit?: EndUnit): Promise<{ reopen: Reopen }> {
    return endSession(this.deployed, coder, item, unit);
  }

  reopenSession(coder: Coder): Promise<void> {
    return reopenSession(this.deployed, coder);
  }

  quitSession(coder: Coder, requestDeletion: boolean): Promise<void> {
    return quitSession(this.deployed, coder, requestDeletion);
  }

  /** How the coder's screen looks now (docs/client.md §4 "Display"): recorded when it changed. */
  async recordDisplay(coder: Coder, entry: DisplayEntry): Promise<void> {
    await this.store.recordDisplay(coder.sessionId, entry);
  }

  createTransfer(coder: Coder): Promise<TransferResponse> {
    return createTransfer(this.deployed, coder);
  }

  redeemTransfer(
    token: string,
    keys: (coderId: string | null) => Promise<string[]>,
    device: DeviceDetails,
  ): Promise<void> {
    return redeemTransfer(this.deployed, token, keys, device);
  }

  /** Progress per loop and set, for the researchers. */
  status(): Promise<DeploymentStatus> {
    return deploymentStatus(this.deployed);
  }
}
