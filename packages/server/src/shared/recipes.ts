import { DesignItemsSchema, EMPTY_SESSION, addedFields, designItems, checkUnitData, type DesignItem, type Recipe, type UnitData, type UnitField } from "@annotinder/contracts";
import { one, type Sql } from "../db.js";
import { putDeployment } from "./deployments.js";
import { HttpError } from "./http.js";
import type { StudyRow } from "./studies.js";
import { checkUnitUpload } from "./limits.js";
import { checkLinkCount, syncLinks } from "./links.js";
import { putSetGroup } from "./sets.js";
import { saveUnits } from "./units.js";

// Recipes (contracts recipe.ts, docs/plans/setup-wizard.md): a new study's
// units, set groups and first codebook in one document; deploying it makes
// its links (shared/links.ts `syncLinks`). Example
// studies and the setup wizard both make studies through here.

export interface RecipeOptions {
  /** The researcher who owns the study (null: none, e.g. the development demo). */
  ownerId: number | null;
  /** They become the study's ADMIN; null: no study users (development headers). */
  ownerEmail: string | null;
  /** The example the study came from (`studies.origin`). */
  origin?: string;
  /** Fixed link secrets, in order (the development demo's `demo-secret`); random otherwise. */
  secrets?: string[];
}

export interface MadeStudy {
  study: StudyRow;
  designVersionId: number;
  /** Database ids of the recipe's units, by their ids in the recipe. */
  unitIds: Map<string, number>;
  /** The first link's id, if deployed. */
  firstLink: number | null;
}

const invalid = (message: string) => new HttpError(400, message, "recipe_invalid");

/**
 * Makes a study from a recipe, within the transaction `tx` (the caller's, so
 * it can add to the study, as examples add answers). Within the owner's
 * limits on units; the caller checks the number of studies.
 */
export async function createStudyFromRecipe(tx: Sql, recipe: Recipe, options: RecipeOptions): Promise<MadeStudy> {
  // A deployed codebook must pass validation; a draft may have issues (questions to specify).
  if (recipe.publish) {
    const parsed = DesignItemsSchema.safeParse(designItems(recipe.design));
    if (!parsed.success) throw invalid(`The design can't be deployed: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }

  const study = (await one<StudyRow>(tx, "INSERT INTO studies (name, owner_id, origin) VALUES ($1, $2, $3) RETURNING *", [
    recipe.name,
    options.ownerId,
    options.origin ?? null,
  ]))!;
  if (options.ownerEmail) await tx.query("INSERT INTO study_users (study_id, email, role) VALUES ($1, $2, 'ADMIN')", [study.id, options.ownerEmail]);

  // Units
  const unitIds = new Map<string, number>();
  let fields: UnitField[] = [];
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
      study.id,
      recipe.units.map((u) => ({ externalId: u.id, data: u.data })),
      recipe.units.length,
    );
    fields = added.fields;
    for (const [id, unitId] of await saveUnits(tx, study.id, recipe.units.map((u) => ({ externalId: u.id, data: u.data })))) unitIds.set(id, unitId);
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
      study.id,
      group.group,
      group.sets.map((set) => ({ name: set.name, unitIds: set.units.map(unitId), ordered: set.ordered })),
    );
  }

  // The codebook: deployed, or the first draft
  // With the units' fields (docs/plans/design.md §3)
  const designVersionId = (await one<{ id: number }>(tx, "INSERT INTO design_versions (study_id, note, items, units, session, public) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id", [
    study.id,
    recipe.design.note ?? null,
    JSON.stringify(recipe.design.items),
    JSON.stringify({ fields }),
    JSON.stringify(recipe.design.session ?? EMPTY_SESSION),
    recipe.design.public ? JSON.stringify(recipe.design.public) : null,
  ]))!.id;
  let firstLink: number | null = null;
  if (recipe.publish) {
    await putDeployment(tx, study.id, { designVersionId, active: true, units: true });
    await checkLinkCount(tx, study.id, designItems(recipe.design) as DesignItem[], true, true);
    await syncLinks(tx, study.id, { secrets: options.secrets });
    firstLink = (await one<{ id: number }>(tx, "SELECT id FROM links WHERE study_id = $1 ORDER BY id LIMIT 1", [study.id]))?.id ?? null;
  }
  return { study, designVersionId, unitIds, firstLink };
}
