import { AnnotateUnit, Annotation, Codebook, Layout } from "@/app/types";

interface Params {
  type: "survey" | "annotation";
  token: string;
  data?: Record<string, string | number | boolean>;
  layout?: Layout;
  codebook?: Codebook;
  codebook_id?: number;
  annotations: Annotation[];
}

export function createAnnotateUnit({
  type,
  token,
  data,
  layout,
  codebook,
  codebook_id,
  annotations,
}: Params): AnnotateUnit {
  const unit: AnnotateUnit = {
    type,
    token,
    status: "IN_PROGRESS",
    content: {
      grid: { areas: [] },
    },

    annotations,
  };
  if (codebook !== undefined) unit.codebook = codebook;
  if (codebook_id !== undefined) unit.codebook_id = codebook_id;

  if (codebook === undefined && codebook_id === undefined)
    throw new Error("Either codebook or codebook_id must be provided");

  if (data === undefined || layout === undefined) return unit;

  layout.fields.forEach((field) => {
    if (unit.content.grid?.areas) unit.content.grid.areas.push([field.name]);
    const value = String(data[field.column] || "");

    if (field.type === "text") {
      if (!unit.content.text_fields) unit.content.text_fields = [];
      unit.content.text_fields.push({
        type: "text",
        name: field.name,
        value,
        style: field.style,
      });
    }
    if (field.type === "markdown") {
      if (!unit.content.markdown_fields) unit.content.markdown_fields = [];
      unit.content.markdown_fields.push({
        type: "markdown",
        name: field.name,
        value,
      });
    }
    if (field.type === "image") {
      if (!unit.content.image_fields) unit.content.image_fields = [];
      unit.content.image_fields.push({
        type: "image",
        name: field.name,
        value,
        alt: field.alt,
        caption: field.caption,
      });
    }

    // NOT SURE WHERE TO REPLACE THIS. IN ANY CASE, IT'S ABOUT MAKING MAPPED VARIABLES AVAILABLE IN THE UNIT EVAL
    // (layout.variables || []).forEach((variable) => {
    //   if (!unit.content.variables) unit.content.variables = {};
    //   unit.content.variables[variable.name] = data[variable.column];
    // });
  });

  if (layout.grid) unit.content.grid = layout.grid;

  return unit;
}
