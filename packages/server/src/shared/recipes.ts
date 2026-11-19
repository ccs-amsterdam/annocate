import {
  DesignItemsSchema,
  EMPTY_SESSION,
  addedFields,
  designItems,
  checkUnitData,
  type DesignItem,
  type Recipe,
  type UnitData,
  type UnitField,
} from "@annotinder/contracts";
import { asc, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { designVersions, links, roles, studies } from "../db/schema/index.js";
import { putDeployment } from "./deployments.js";
import { HttpError } from "./http.js";
import type { StudyRow } from "./studies.js";
import { checkUnitUpload } from "./limits.js";
import { checkLinkCount, syncLinks } from "./links.js";
import { assignmentChecks, putSetGroup } from "./sets.js";
import { saveUnits } from "./units.js";

// Recipes (contracts recipe.ts, docs/plans/setup-wizard.md): a new study's
// units, set groups and first codebook in one document; deploying it makes
// its links (shared/links.ts `syncLinks`). Example
// studies and the setup wizard both make studies through here.

export interface RecipeOptions {
  /** The researcher who owns the study (null: none, e.g. the development demo). */
  ownerId: number | null;
  /** The owner becomes the study's ADMIN (false: no user roles, development headers). */
  ownerIsAdmin: boolean;
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
export async function createStudyFromRecipe(tx: Db, recipe: Recipe, options: RecipeOptions): Promise<MadeStudy> {
  // A deployed codebook must pass validation; a draft may have issues (questions to specify).
  if (recipe.publish) {
    const parsed = DesignItemsSchema.safeParse(designItems(recipe.design));
    if (!parsed.success)
      throw invalid(`The design can't be deployed: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }

  const [made] = await tx
    .insert(studies)
    .values({ name: recipe.name, ownerId: options.ownerId, origin: options.origin ?? null, signIn: recipe.signIn ?? "off" })
    .returning();
  const study = made!;
  if (options.ownerId !== null && options.ownerIsAdmin) await tx.insert(roles).values({ role: "ADMIN", studyId: study.id, userId: options.ownerId });

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
    for (const [id, unitId] of await saveUnits(
      tx,
      study.id,
      recipe.units.map((u) => ({ externalId: u.id, data: u.data })),
    ))
      unitIds.set(id, unitId);
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
    if (fields.some((f) => f.name === group.group)) throw invalid(`'${group.group}' is a field of the units and a set column`);
    await putSetGroup(
      tx,
      study.id,
      group.group,
      group.sets.map((set) => ({ name: set.name, unitIds: set.units.map(unitId), ordered: set.ordered })),
      { declare: false },
    );
  }
  // Set columns are fields of type set
  fields = [...fields, ...groups.map((name) => ({ name, type: "set" as const }))];

  // The codebook: deployed, or the first draft
  // With the units' fields (docs/plans/design.md §3)
  const [designVersion] = await tx
    .insert(designVersions)
    .values({
      studyId: study.id,
      note: recipe.design.note ?? null,
      items: recipe.design.items,
      units: { fields },
      session: recipe.design.session ?? EMPTY_SESSION,
      public: recipe.design.public ?? null,
    })
    .returning({ id: designVersions.id });
  const designVersionId = designVersion!.id;
  let firstLink: number | null = null;
  if (recipe.publish) {
    await putDeployment(tx, study.id, { designVersionId, active: true, units: true });
    const checks = await assignmentChecks(tx, study.id, designItems(recipe.design) as DesignItem[], fields, true);
    if (checks.errors.length > 0) throw invalid(checks.errors.join(" "));
    await checkLinkCount(tx, study.id, designItems(recipe.design) as DesignItem[], true, true);
    await syncLinks(tx, study.id, { secrets: options.secrets });
    const [first] = await tx.select({ id: links.id }).from(links).where(eq(links.studyId, study.id)).orderBy(asc(links.id)).limit(1);
    firstLink = first?.id ?? null;
  }
  return { study, designVersionId, unitIds, firstLink };
}
