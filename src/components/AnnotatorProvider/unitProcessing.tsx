import { importTokens, parseTokens } from "../../functions/tokens";
import {
  ProcessedTextField,
  ProcessedMarkdownField,
  ProcessedImageField,
  PreparedGrid,
  FieldGridInput,
  ExtendedCodebook,
  Unit,
  SetState,
  JobServer,
  GetUnit,
  Doc,
  Layout,
  GetJobState,
  JobState,
} from "@/app/types";
import { UnitBundle } from "./AnnotatorProvider";
import AnnotationManager from "@/functions/AnnotationManager";

export function createUnitBundle({
  jobServer,
  getUnit,
  codebook,
  setUnitBundle,
  variableIndex,
}: {
  jobServer: JobServer;
  getUnit: GetUnit;
  codebook: ExtendedCodebook;
  setUnitBundle: SetState<UnitBundle | null>;
  variableIndex?: number;
}): UnitBundle {
  const unit = {
    token: getUnit.token,
    type: getUnit.progress.phases[getUnit.progress.phase].type,
    status: getUnit.status,
    data: getUnit.data,
    annotations: getUnit.annotations,
  };

  const annotationManager = new AnnotationManager();
  annotationManager.initialize({ jobServer, unit, codebook, setUnitBundle, variableIndex });

  return {
    unit,
    codebook: codebook,
    annotationManager,
    annotationLib: annotationManager.annotationLib,
    progress: getUnit.progress,
    error: undefined,
  };
}

interface ProcessUnitContentParams {
  unit: Unit;
  layout: Layout;
  evalStringWithJobState: (str: string, jobState: JobState) => Promise<string>;
  jobState: JobState;
}

export async function processUnitContent({
  unit,
  layout,
  evalStringWithJobState,
  jobState,
}: ProcessUnitContentParams): Promise<Doc> {
  const content: Doc = {
    tokens: [],
    textFields: [],
    imageFields: [],
    markdownFields: [],
    grid: {},
  };

  for (let field of layout.fields) {
    const base = {
      name: field.name,
      style: field.style,
    };

    if (field.type === "text") {
      content.textFields.push({
        ...base,
        value: String(unit?.data?.[field.column] || ""),
        context_after: field.context_after,
        context_before: field.context_before,
      });
    } else if (field.type === "image") {
      content.imageFields.push({
        ...base,
        value: String(unit?.data?.[field.column] || ""),
        alt: field.alt,
        caption: field.caption,
      });
    } else if (field.type === "markdown") {
      content.markdownFields.push({
        ...base,
        value: await evalStringWithJobState(field.template, jobState),
      });
    }
  }

  if (content.textFields.length > 0) {
    content.tokens = parseTokens([...content.textFields]);
  }
  // !! prepareGrid removes unused fields from content by reference
  content.grid = prepareGrid(layout.grid, content);

  return content;
}

function prepareGrid(grid: FieldGridInput | undefined, content: Doc): PreparedGrid {
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
  if (content.textFields)
    content.textFields = content.textFields.filter((f: ProcessedTextField) => used_columns.has(f.name));
  if (content.imageFields)
    content.imageFields = content.imageFields.filter((f: ProcessedImageField) => used_columns.has(f.name));
  if (content.markdownFields)
    content.markdownFields = content.markdownFields.filter((f: ProcessedMarkdownField) => used_columns.has(f.name));

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
