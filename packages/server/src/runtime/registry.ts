import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { deployments, sessionDevices, studies, transfers } from "../db/schema/index.js";
import type { DeploymentStatus } from "@annotinder/contracts";
import { HttpError } from "../shared/http.js";
import { linkInfo } from "../shared/links.js";
import { DeploymentRuntime, DEFAULT_RUNTIME_OPTIONS, type RuntimeOptions } from "./runtime.js";
import { nothingHere, sha256 } from "./session.js";
import { DbStore } from "./dbStore.js";
import { sessionOfEmail } from "./startSession.js";
import type { Store } from "./store.js";
import { PreviewStore, previewToken, verifyPreviewToken } from "./preview.js";

/** A deployment id: a study's public id, with `.preview` for a researcher preview. */
const DEPLOYMENT_ID = /^([a-z0-9]{12})(\.preview)?$/;

/** Whether a deployment id is a researcher preview's (`<publicId>.preview`). */
export const isPreviewId = (deploymentId: string) => deploymentId.endsWith(".preview");

/**
 * What a coder request shows to belong to a deployment (`Deployments.admit`):
 * a link's secret (or a preview token), the keys its device may have a
 * session under (session.ts `possibleCoderKeys`), a transfer token, or a
 * login (a coder opening their study on a new device, without the link).
 */
export interface Proof {
  linkSecret?: string;
  deviceKeys?: string[];
  transferToken?: string;
  /** The request's login, read only when nothing else shows it belongs: its email has a session in the study. */
  login?: () => Promise<{ email: string } | null>;
}

interface Loaded {
  runtime: Promise<DeploymentRuntime>;
  usedAt: number;
  studyId: number;
  /** A preview's coders and answers (preview.ts). */
  preview?: PreviewStore;
}

/**
 * Lazily loads one DeploymentRuntime per deployment, in memory: `<publicId>`
 * (the study's public id, `studies.public_id`), or `<publicId>.preview` for
 * a researcher preview. Runtimes rebuild themselves from the database, so
 * after a restart the first request for a deployment simply loads it again.
 * Deployments unused for `deploymentIdleMs` are dropped, and so is the one
 * used longest ago when more than `maxDeployments` are loaded.
 */
export class Deployments {
  /** By deployment id, the one used longest ago first. */
  private runtimes = new Map<string, Loaded>();

  constructor(
    private db: Db,
    /** Signs preview tokens. */
    private secret: string,
    private options: RuntimeOptions = DEFAULT_RUNTIME_OPTIONS,
    /** Tests: observe or alter what the runtime reads and writes. */
    private wrapStore: (store: Store) => Store = (store) => store,
  ) {}

  /**
   * The runtime for a coder request, loaded only if the request belongs
   * there (`Proof`): otherwise anyone could make the server load every
   * study by trying ids. A request that shows nothing valid gets the same
   * 404 whether or not the study exists, is deployed or is suspended (a
   * preview: 401, its token expired).
   */
  async admit(deploymentId: string, proof: Proof): Promise<DeploymentRuntime> {
    const match = DEPLOYMENT_ID.exec(deploymentId);
    if (!match) throw nothingHere();
    const loaded = this.loaded(deploymentId);
    if (!match[2]) {
      // Loaded: the runtime checks the link or device itself (one query, `Store.resolveCoder`)
      if (loaded) return loaded.runtime;
      const studyId = await this.studyId(match[1]!);
      if (studyId === null || !(await this.belongs(studyId, proof))) throw nothingHere();
      // Loaded meanwhile by another request: that one
      return (this.loaded(deploymentId) ?? this.load(deploymentId, studyId)).runtime;
    }
    // A preview re-reads the draft on every request: only for its token, or a device that started with one
    if (loaded?.preview && (await knownToPreview(loaded.preview, proof))) return loaded.runtime;
    const studyId = await this.studyId(match[1]!);
    const token = proof.linkSecret;
    const valid =
      studyId !== null && token !== undefined && verifyPreviewToken(this.secret, studyId, token, this.options.now());
    if (!valid) throw new HttpError(401, "This preview link has expired; open the preview again");
    return (this.loaded(deploymentId) ?? this.load(deploymentId, studyId)).runtime;
  }

  /** Whether a link, device, transfer token or login of the request is this study's: an indexed lookup each. */
  private async belongs(studyId: number, proof: Proof): Promise<boolean> {
    if (proof.linkSecret && (await linkInfo(this.db, proof.linkSecret))?.studyId === studyId) return true;
    if (proof.deviceKeys?.length) {
      const devices = and(eq(sessionDevices.studyId, studyId), inArray(sessionDevices.keyHash, proof.deviceKeys));
      if ((await this.db.$count(sessionDevices, devices)) > 0) return true;
    }
    if (proof.transferToken) {
      const transfer = and(eq(transfers.studyId, studyId), eq(transfers.tokenHash, await sha256(proof.transferToken)));
      if ((await this.db.$count(transfers, transfer)) > 0) return true;
    }
    const login = await proof.login?.();
    return !!login && (await sessionOfEmail(this.db, studyId, login.email)) !== undefined;
  }

  private async studyId(publicId: string): Promise<number | null> {
    const [study] = await this.db.select({ id: studies.id }).from(studies).where(eq(studies.publicId, publicId));
    return study?.id ?? null;
  }

  /** A loaded deployment, now the last used. Idle ones are forgotten first (also this one, which then loads afresh). */
  private loaded(deploymentId: string): Loaded | undefined {
    const now = this.options.now();
    for (const [id, entry] of this.runtimes) {
      if (now - entry.usedAt >= this.options.deploymentIdleMs) this.runtimes.delete(id);
    }
    const entry = this.runtimes.get(deploymentId);
    if (!entry) return undefined;
    entry.usedAt = now;
    this.runtimes.delete(deploymentId);
    this.runtimes.set(deploymentId, entry);
    return entry;
  }

  private load(deploymentId: string, studyId: number): Loaded {
    const preview = isPreviewId(deploymentId)
      ? new PreviewStore(new DbStore(this.db, studyId, true), this.secret, studyId, this.options.now)
      : undefined;
    // A preview: the latest design, checked on every request so edits show right away
    const store = preview ?? new DbStore(this.db, studyId);
    const created = new DeploymentRuntime(deploymentId, this.wrapStore(store), this.options);
    const loading = created.load().then(() => created);
    const entry: Loaded = { runtime: loading, usedAt: this.options.now(), studyId, preview };
    this.runtimes.set(deploymentId, entry);
    // Don't cache failures (e.g. study not deployed): retry on the next request.
    loading.catch(() => {
      if (this.runtimes.get(deploymentId) === entry) this.runtimes.delete(deploymentId);
    });
    // Too many: the ones used longest ago go (requests they are serving finish with them)
    for (const id of this.runtimes.keys()) {
      if (this.runtimes.size <= this.options.maxDeployments) break;
      this.runtimes.delete(id);
    }
    return entry;
  }

  /**
   * Something coders' runtimes read changed (units, their sets, study settings,
   * a reset): bumps the deployment's revision, so every server process
   * re-reads it on its next request (`DeploymentRuntime.refresh`). Returns
   * the deployment's version.
   */
  async bumpRevision(studyId: number): Promise<number | null> {
    const [row] = await this.db
      .update(deployments)
      .set({ revision: sql`${deployments.revision} + 1` })
      .where(eq(deployments.studyId, studyId))
      .returning({ version: deployments.version });
    return row?.version ?? null;
  }

  /** The id of a study's deployment: its public id. 404 for a study that doesn't exist. */
  async deploymentId(studyId: number): Promise<string> {
    const [study] = await this.db.select({ publicId: studies.publicId }).from(studies).where(eq(studies.id, studyId));
    if (!study) throw new HttpError(404, "Study not found");
    return study.publicId;
  }

  /** A study's progress, for its researchers. */
  async status(studyId: number): Promise<DeploymentStatus> {
    const deploymentId = await this.deploymentId(studyId);
    const runtime = await (this.loaded(deploymentId) ?? this.load(deploymentId, studyId)).runtime;
    await runtime.refresh();
    return runtime.status();
  }

  previewToken(studyId: number, expiresAt: number): string {
    return previewToken(this.secret, studyId, expiresAt);
  }

  /** Forgets a study's deployment and preview, e.g. when the study is deleted. */
  drop(studyId: number): void {
    for (const [id, entry] of this.runtimes) if (entry.studyId === studyId) this.runtimes.delete(id);
  }
}

/** Whether a device or transfer token of the request is one this preview handed out. */
async function knownToPreview(preview: PreviewStore, proof: Proof): Promise<boolean> {
  if (proof.deviceKeys?.some((key) => preview.hasDevice(key))) return true;
  return proof.transferToken !== undefined && preview.hasTransfer(await sha256(proof.transferToken));
}
