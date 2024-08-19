import { importTokens, parseTokens } from "../../functions/tokens";
import {
  ExtendedUnitContent,
  RawUnitContent,
  TextField,
  MarkdownField,
  ImageField,
  PreparedGrid,
  FieldGridInput,
  ExtendedCodebook,
  Unit,
} from "@/app/types";
import { UnitBundle } from "./AnnotatorProvider";
import unfoldVariables from "../../functions/unfoldVariables";

export function createUnitBundle(annotateUnit: Unit, codebook: ExtendedCodebook): UnitBundle {
  codebook = unfoldVariables(codebook, annotateUnit);
  const content = processUnitContent(annotateUnit);
  return {
    unit: {
      ...annotateUnit,
      content,
    },
    codebook,
  };
}

/**
 * Any steps for validating and preparing the unit content should go here
 *
 * @param unit
 * @returns
 */
export default function processUnitContent(annotateUnit: Unit): ExtendedUnitContent {
  const ruc = annotateUnit.content;

  const content: ExtendedUnitContent = {
    text_fields: ruc.text_fields || [],
    image_fields: ruc.image_fields || [],
    markdown_fields: ruc.markdown_fields || [],
    meta: ruc.meta || {},
    grid: {},
  };

  // !! prepareGrid also removes unused fields from content (by reference)
  content.grid = prepareGrid(ruc.grid, content);

  if (ruc.tokens) {
    content.tokens = importTokens(ruc.tokens) || [];
  } else if (content.text_fields) {
    content.tokens = parseTokens([...content.text_fields]);
  }

  return content;
}

function prepareGrid(grid: FieldGridInput | undefined, content: ExtendedUnitContent): PreparedGrid {
  // areas should be an array of arrays of the same length, where all values are strings.
  // there is some leeway (inner array can be a single string, and if inner arrays do not have same length, last value is repeated).
  // this is then used to create the grid-template-areas
  const outputGrid: PreparedGrid = {};

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
  if (content.text_fields) content.text_fields = content.text_fields.filter((f: TextField) => used_columns.has(f.name));
  if (content.image_fields)
    content.image_fields = content.image_fields.filter((f: ImageField) => used_columns.has(f.name));
  if (content.markdown_fields)
    content.markdown_fields = content.markdown_fields.filter((f: MarkdownField) => used_columns.has(f.name));

  // add area names
  for (let f of content.text_fields || []) f.grid_area = areaNameMap[f.name];
  for (let f of content.image_fields || []) f.grid_area = areaNameMap[f.name];
  for (let f of content.markdown_fields || []) f.grid_area = areaNameMap[f.name];

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
