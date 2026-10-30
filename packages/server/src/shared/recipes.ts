import { randomBytes } from "node:crypto";
import { CodebookItemsSchema, addedFields, checkUnitData, type Recipe, type UnitData } from "@annotinder/contracts";
import { one, type Sql } from "../db.js";
import { putDeployment } from "./deployments.js";
import { HttpError } from "./http.js";
import type { JobRow } from "./jobs.js";
import { checkUnitUpload } from "./limits.js";
import { setUnitFields } from "./units.js";

// Recipes (contracts recipe.ts, docs/plans/setup-wizard.md): a new job's
// units, unitsets, first codebook and invitations in one document. Example
// jobs and the setup wizard both make jobs through here.

export interface RecipeOptions {
  /** The researcher who owns the job (null: none, e.g. the development demo). */
  ownerId: number | null;
  /** They become the job's ADMIN; null: no job users (development headers). */
  ownerEmail: string | null;
  /** The example the job came from (`jobs.origin`). */
  origin?: string;
  /** Fixed invite secrets, in order (the development demo's `demo-secret`); random otherwise. */
  secrets?: string[];
}

export interface MadeJob {
  job: JobRow;
  codebookId: number;
  /** Database ids of the recipe's units, by their ids in the recipe. */
  unitIds: Map<string, number>;
  /** The first invitation's id, if any. */
  firstInvite: number | null;
}

const invalid = (message: string) => new HttpError(400, message, "recipe_invalid");

/**
 * Makes a job from a recipe, within the transaction `tx` (the caller's, so
 * it can add to the job, as examples add answers). Within the owner's
 * limits on units; the caller checks the number of jobs.
 */
export async function createJobFromRecipe(tx: Sql, recipe: Recipe, options: RecipeOptions): Promise<MadeJob> {
  // A published codebook must pass validation; a draft may have issues (questions to specify).
  if (recipe.publish) {
    const parsed = CodebookItemsSchema.safeParse(recipe.codebook.items);
    if (!parsed.success) throw invalid(`The codebook can't be published: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }

  const job = (await one<JobRow>(tx, "INSERT INTO jobs (name, owner_id, origin) VALUES ($1, $2, $3) RETURNING *", [
    recipe.name,
    options.ownerId,
    options.origin ?? null,
  ]))!;
  if (options.ownerEmail) await tx.query("INSERT INTO job_users (job_id, email, role) VALUES ($1, $2, 'ADMIN')", [job.id, options.ownerEmail]);

  // Units
  const unitIds = new Map<string, number>();
  if (recipe.units.length > 0) {
    const ids = recipe.units.map((u) => u.id);
    const twice = ids.find((id, i) => ids.indexOf(id) !== i);
    if (twice !== undefined) throw invalid(`Unit id '${twice}' is used twice`);
    const added = addedFields(
      recipe.units.map((u) => u.data as UnitData),
      [],
    );
    if ("error" in added) throw invalid(added.error);
    for (const unit of recipe.units) {
      const problem = checkUnitData(unit.data as UnitData, added.fields);
      if (problem) throw invalid(`Unit '${unit.id}': ${problem}`);
    }
    await checkUnitUpload(
      tx,
      job.id,
      recipe.units.map((u) => ({ externalId: u.id, data: u.data })),
      recipe.units.length,
    );
    await setUnitFields(tx, job.id, added.fields);
    for (const unit of recipe.units) {
      const row = await one<{ id: number }>(tx, "INSERT INTO units (job_id, external_id, data) VALUES ($1, $2, $3) RETURNING id", [
        job.id,
        unit.id,
        JSON.stringify(unit.data),
      ]);
      unitIds.set(unit.id, row!.id);
    }
  }
  const unitId = (id: string) => {
    const found = unitIds.get(id);
    if (found === undefined) throw invalid(`No unit '${id}'`);
    return found;
  };

  // Unitsets
  const unitsetIds = new Map<string, number>();
  for (const set of recipe.unitsets) {
    if (unitsetIds.has(set.name)) throw invalid(`Unitset '${set.name}' is defined twice`);
    const row = await one<{ id: number }>(tx, "INSERT INTO unitsets (job_id, name, unit_ids) VALUES ($1, $2, $3) RETURNING id", [
      job.id,
      set.name,
      set.units.map(unitId),
    ]);
    unitsetIds.set(set.name, row!.id);
  }

  // The codebook: published, or the first draft
  const codebookId = (await one<{ id: number }>(tx, "INSERT INTO codebooks (job_id, note, items) VALUES ($1, $2, $3) RETURNING id", [
    job.id,
    recipe.codebook.note ?? null,
    JSON.stringify(recipe.codebook.items),
  ]))!.id;
  if (recipe.publish) await putDeployment(tx, job.id, { codebookId, active: true });

  // Invitations
  let firstInvite: number | null = null;
  for (const [i, invite] of recipe.invites.entries()) {
    const { unitset, label, auth, emails, maxUses, variables, participantId, participantParam, urlParams } = invite;
    const setId = unitset === undefined ? null : unitsetIds.get(unitset);
    if (setId === undefined) throw invalid(`Invitation '${label}': no unitset '${unitset}'`);
    const row = await one<{ id: number }>(
      tx,
      `INSERT INTO invites (job_id, label, auth, secret, emails, max_uses, variables, participant_id, participant_param, url_params, unitset_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        job.id,
        label,
        auth,
        options.secrets?.[i] ?? randomBytes(16).toString("hex"),
        emails ? JSON.stringify(emails) : null,
        maxUses ?? null,
        JSON.stringify(variables ?? {}),
        participantId ?? null,
        participantParam ? JSON.stringify(participantParam) : null,
        urlParams?.length ? JSON.stringify(urlParams) : null,
        setId,
      ],
    );
    firstInvite ??= row!.id;
  }
  return { job, codebookId, unitIds, firstInvite };
}
