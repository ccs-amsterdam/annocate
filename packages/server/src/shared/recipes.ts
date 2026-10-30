import { CodebookItemsSchema, addedFields, checkUnitData, type CodebookItem, type Recipe, type UnitData } from "@annotinder/contracts";
import { one, type Sql } from "../db.js";
import { putDeployment } from "./deployments.js";
import { HttpError } from "./http.js";
import type { JobRow } from "./jobs.js";
import { checkUnitUpload } from "./limits.js";
import { checkLinkCount, syncLinks } from "./invites.js";
import { putSetGroup } from "./sets.js";
import { setUnitFields } from "./units.js";

// Recipes (contracts recipe.ts, docs/plans/setup-wizard.md): a new job's
// units, set groups and first codebook in one document; publishing it makes
// its links (shared/invites.ts `syncLinks`). Example
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
  /** The first link's id, if published. */
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

  // Set groups
  const groups = recipe.sets.map((g) => g.group);
  const twice = groups.find((g, i) => groups.indexOf(g) !== i);
  if (twice !== undefined) throw invalid(`Group '${twice}' is defined twice`);
  for (const group of recipe.sets) {
    await putSetGroup(
      tx,
      job.id,
      group.group,
      group.sets.map((set) => ({ name: set.name, unitIds: set.units.map(unitId), ordered: set.ordered })),
    );
  }

  // The codebook: published, or the first draft
  const codebookId = (await one<{ id: number }>(tx, "INSERT INTO codebooks (job_id, note, items) VALUES ($1, $2, $3) RETURNING id", [
    job.id,
    recipe.codebook.note ?? null,
    JSON.stringify(recipe.codebook.items),
  ]))!.id;
  let firstInvite: number | null = null;
  if (recipe.publish) {
    await putDeployment(tx, job.id, { codebookId, active: true });
    await checkLinkCount(tx, job.id, recipe.codebook.items as CodebookItem[], true);
    await syncLinks(tx, job.id, { secrets: options.secrets });
    firstInvite = (await one<{ id: number }>(tx, "SELECT id FROM invites WHERE job_id = $1 ORDER BY id LIMIT 1", [job.id]))?.id ?? null;
  }
  return { job, codebookId, unitIds, firstInvite };
}
