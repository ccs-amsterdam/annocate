import { DESIGN_FORMAT_VERSION } from "@annotinder/contracts";
import {
  DesignItemsSchema,
  EMPTY_SESSION,
  addedFields,
  collectQuestions,
  reservedColumnError,
  designItems,
  checkUnitData,
  isSetType,
  roleColumnType,
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
import { assignmentChecks } from "./deployChecks.js";
import { putSetGroup } from "./sets.js";
import { saveUnits } from "./units.js";
import { firstDuplicate } from "./lists.js";

// Recipes (contracts recipe.ts, docs/examples.md): a new study's units, its
// columns with a role and first design version in one document; deploying it makes its
// links (shared/links.ts `syncLinks`). Example studies and design files
// both make studies through here.

export interface RecipeOptions {
  /** The researcher who owns the study (null: none, e.g. the development demo). */
  ownerId: number | null;
  /** The owner becomes the study's ADMIN (false: no user roles, development headers). */
  ownerIsAdmin: boolean;
  /** The example the study came from (`studies.origin`). */
  origin?: string;
  /** Fixed link secrets, in order (the development demo's `demo-secret`); random otherwise. */
  secrets?: string[];
  /** A fixed public id (the development demo's); random otherwise. */
  publicId?: string;
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
 * Saves a recipe's units, checked against the declared fields (a design
 * file's) and those the units add. Returns the data fields (not columns
 * with a role) and the units' database ids by their ids in the recipe.
 */
async function saveRecipeUnits(
  tx: Db,
  studyId: number,
  recipe: Recipe,
  declared: UnitField[],
): Promise<{ dataFields: UnitField[]; unitIds: Map<string, number> }> {
  const unitIds = new Map<string, number>();
  const dataFields = declared.filter((f) => !isSetType(f.type));
  if (recipe.units.length === 0) return { dataFields, unitIds };
  const twice = firstDuplicate(recipe.units.map((u) => u.id));
  if (twice !== undefined) throw invalid(`Unit id '${twice}' is used twice`);
  const added = addedFields(
    recipe.units.map((u) => u.data as UnitData),
    declared,
  );
  if ("error" in added) throw invalid(added.error);
  // answer_<q> and feedback_<q> are the design's questions' columns
  const questions = new Set(collectQuestions(recipe.design.items).questions.keys());
  for (const field of [...declared, ...added.fields]) {
    const reserved = reservedColumnError(field.name, questions);
    if (reserved) throw invalid(reserved);
  }
  const all = [...declared, ...added.fields];
  for (const unit of recipe.units) {
    const problem = checkUnitData(unit.data as UnitData, all);
    if (problem) throw invalid(`Unit '${unit.id}': ${problem}`);
  }
  const units = recipe.units.map((u) => ({ externalId: u.id, data: u.data }));
  await checkUnitUpload(tx, studyId, units, recipe.units.length);
  for (const [id, unitId] of await saveUnits(tx, studyId, units)) unitIds.set(id, unitId);
  return { dataFields: [...dataFields, ...added.fields], unitIds };
}

/**
 * Saves a recipe's columns with a role (as sets). Returns them as fields of
 * their type: the declared ones (with their descriptions), then the others.
 */
async function saveRecipeSets(
  tx: Db,
  studyId: number,
  recipe: Recipe,
  declared: UnitField[],
  dataFields: UnitField[],
  unitIds: Map<string, number>,
): Promise<UnitField[]> {
  const unitId = (id: string) => {
    const found = unitIds.get(id);
    if (found === undefined) throw invalid(`No unit '${id}'`);
    return found;
  };
  const groups = recipe.sets.map((g) => g.column);
  const twice = firstDuplicate(groups);
  if (twice !== undefined) throw invalid(`Column '${twice}' is defined twice`);
  for (const group of recipe.sets) {
    if (dataFields.some((f) => f.name === group.column))
      throw invalid(`'${group.column}' is a field of the units and a column with a role`);
    await putSetGroup(
      tx,
      studyId,
      group.column,
      group.sets.map((set) => ({ name: set.name, unitIds: set.units.map(unitId), ordered: set.ordered })),
      { declare: false },
    );
  }
  const declaredSets = declared.filter((f) => isSetType(f.type));
  return [
    ...declaredSets,
    ...groups
      .filter((name) => !declaredSets.some((f) => f.name === name))
      .map((name) => ({ name, type: roleColumnType(name) })),
  ];
}

/**
 * Makes a study from a recipe, within the transaction `tx` (the caller's, so
 * it can add to the study, as examples add answers). Within the owner's
 * limits on units; the caller checks the number of studies.
 */
export async function createStudyFromRecipe(tx: Db, recipe: Recipe, options: RecipeOptions): Promise<MadeStudy> {
  // A deployed design version must pass validation; a draft may have issues (questions to specify).
  if (recipe.deploy) {
    const parsed = DesignItemsSchema.safeParse(designItems(recipe.design));
    if (!parsed.success)
      throw invalid(`The design can't be deployed: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }

  const [made] = await tx
    .insert(studies)
    .values({
      name: recipe.name,
      ...(options.publicId ? { publicId: options.publicId } : {}),
      ownerId: options.ownerId,
      origin: options.origin ?? null,
    })
    .returning();
  const study = made!;
  if (options.ownerId !== null && options.ownerIsAdmin)
    await tx.insert(roles).values({ role: "ADMIN", studyId: study.id, userId: options.ownerId });

  const declared = recipe.design.units?.fields ?? [];
  const names = declared.map((f) => f.name);
  const declaredTwice = firstDuplicate(names);
  if (declaredTwice !== undefined) throw invalid(`Unit field '${declaredTwice}' is declared twice`);
  const { dataFields, unitIds } = await saveRecipeUnits(tx, study.id, recipe, declared);
  const setFields = await saveRecipeSets(tx, study.id, recipe, declared, dataFields, unitIds);
  // Declared fields in their order, the others after them (a stable sort)
  const place = (name: string) => (names.includes(name) ? names.indexOf(name) : names.length);
  const fields = [...dataFields, ...setFields].sort((a, b) => place(a.name) - place(b.name));

  // The design, with the units' fields (docs/architecture.md §8.4): deployed, or the first draft
  const [designVersion] = await tx
    .insert(designVersions)
    .values({
      studyId: study.id,
      note: recipe.design.note ?? null,
      formatVersion: recipe.design.formatVersion ?? DESIGN_FORMAT_VERSION,
      items: recipe.design.items,
      units: { fields },
      session: recipe.design.session ?? EMPTY_SESSION,
      public: recipe.design.public ?? null,
    })
    .returning({ id: designVersions.id });
  const designVersionId = designVersion!.id;
  let firstLink: number | null = null;
  if (recipe.deploy) {
    await putDeployment(tx, study.id, { designVersionId, active: true, units: true });
    const checks = await assignmentChecks(tx, study.id, designItems(recipe.design) as DesignItem[], true);
    if (checks.errors.length > 0) throw invalid(checks.errors.join(" "));
    await checkLinkCount(tx, study.id, designItems(recipe.design) as DesignItem[], true, true);
    await syncLinks(tx, study.id, { secrets: options.secrets });
    const [first] = await tx
      .select({ id: links.id })
      .from(links)
      .where(eq(links.studyId, study.id))
      .orderBy(asc(links.id))
      .limit(1);
    firstLink = first?.id ?? null;
  }
  return { study, designVersionId, unitIds, firstLink };
}
