import { importTokens, parseTokens } from "./tokens";
import {
  RawUnit,
  Annotation,
  UnitContent,
  RawUnitContent,
  TextField,
  MarkdownField,
  ImageField,
  FieldGrid,
  FieldGridInput,
  Unit,
  Codebook,
  ExtendedCodebook,
} from "@/app/types";
import { importCodebook } from "./codebook";

export function prepareUnit(rawUnit: RawUnit, codebook: ExtendedCodebook): Unit {
  const unitContent = processUnitContent(rawUnit, codebook);
  return {
    jobServer: undefined,
    unitId: rawUnit.id,
    unitType: rawUnit.type,
    status: rawUnit.status,
    report: rawUnit.report,
    unit: unitContent,
  };
}

/**
 * Any steps for validating and preparing the unit content should go here
 *
 * @param unit
 * @returns
 */
export default function processUnitContent(rawUnit: RawUnit, codebook: ExtendedCodebook): UnitContent {
  const ruc: RawUnitContent = rawUnit.unit;
  const annotations: Annotation[] = rawUnit.annotation || rawUnit.annotations || []; // singular annotation is deprecated

  const content: UnitContent = {
    textFields: ruc.text_fields || [],
    imageFields: ruc.image_fields || [],
    markdownFields: ruc.markdown_fields || [],
    metaFields: ruc.meta_fields || [],
    codebook: ruc.codebook ? importCodebook(ruc.codebook) : codebook,
    variables: ruc.variables,
  };

  // !! prepareGrid also removes unused fields from content
  content.grid = prepareGrid(ruc.grid, content);

  if (ruc.tokens) {
    content.tokens = importTokens(ruc.tokens) || [];
  } else if (content.textFields) {
    content.tokens = parseTokens([...content.textFields]);
  }

  // A unit can have pre-defined annotations in rawUnit.unit.annotations
  // If so, we need to set these annotations on the first time the user starts coding this unit.
  // We do this by checking if the unit has any annotations in the jobserver, or if the unit is already DONE.
  const hasAnnotations = annotations && annotations.length > 0;

  content.annotations = hasAnnotations || rawUnit.status === "DONE" ? annotations : ruc.annotations;

  return content;
}

function prepareGrid(grid: FieldGridInput | undefined, content: UnitContent): FieldGrid {
  // areas should be an array of arrays of the same length, where all values are strings.
  // there is some leeway (inner array can be a single string, and if inner arrays do not have same length, last value is repeated).
  // this is then used to create the grid-template-areas
  const outputGrid: FieldGrid = {};

  if (!grid?.areas) return outputGrid;
  let template = [];
  let ncolumns = 1;

  for (let row of grid.areas) {
    if (!Array.isArray(row)) row = [row];
    // first get max row length (= n columns)
    ncolumns = Math.max(ncolumns, row.length);
  }

  // grid area names have certain conditions that we don't want to think of,
  // so we'll enumerate fields and label them f1, f2, etc.
  const areaNameMap: Record<string, string> = {};

  const used_columns = new Set<string>([]);
  for (let row of grid.areas) {
    const row_columns = [];
    for (let i = 0; i < ncolumns; i++) {
      const column = row[i] ?? row[row.length - 1];
      used_columns.add(column);

      if (column === ".") {
        row_columns.push(column);
      } else {
        if (!areaNameMap[column]) areaNameMap[column] = "f" + Object.keys(areaNameMap).length;
        row_columns.push(areaNameMap[column]);
      }
    }
    template.push(`"${row_columns.join(" ")}"`);
  }

  // rm all fields that are not in the template
  if (content.textFields) content.textFields = content.textFields.filter((f: TextField) => used_columns.has(f.name));
  if (content.imageFields)
    content.imageFields = content.imageFields.filter((f: ImageField) => used_columns.has(f.name));
  if (content.markdownFields)
    content.markdownFields = content.markdownFields.filter((f: MarkdownField) => used_columns.has(f.name));

  // add area names
  for (let f of content.textFields || []) f.grid_area = areaNameMap[f.name];
  for (let f of content.imageFields || []) f.grid_area = areaNameMap[f.name];
  for (let f of content.markdownFields || []) f.grid_area = areaNameMap[f.name];

  if (template.length > 0) outputGrid.areas = template.join(" ");

  // columns and rows are arrays of values for fr units. Transform here into strings, repeating
  // last value if array shorter than number of rows/columns.
  if (grid.rows) {
    let rowString = "";
    for (let i = 0; i < template.length; i++) {
      const value = grid.rows[i] ?? grid.rows[grid.rows.length - 1];
      rowString += value + "fr ";
    }
    outputGrid.rows = rowString.trim();
  }
  if (grid.columns) {
    let colString = "";
    for (let i = 0; i < ncolumns; i++) {
      const value = grid.columns[i] ?? grid.columns[grid.columns.length - 1];
      colString += value + "fr ";
    }
    outputGrid.columns = colString.trim();
  }

  return outputGrid;
}
