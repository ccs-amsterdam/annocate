import type { UnitData, UnitField, UnitLayout } from "@annotinder/contracts";
import type { CSSProperties } from "react";
import { renderTemplate } from "../codebook/renderTemplate";
import { SimpleMarkdown } from "./SimpleMarkdown";

/**
 * Renders a unit's `text`/`markdown`/`image` fields per its unit_loop's
 * layout (design plan §2's `UnitLayoutSchema`, Phase 4.2). This is the
 * "Document" renderer for the field types the current contracts data model
 * actually supports.
 *
 * NOT YET SUPPORTED: span/relation annotation rendering (the old
 * `components/Document/*` token/selection/arrow code, ~2700 lines). The
 * current `@annotinder/contracts` codebook/layout schemas have no span or
 * relation field/variable types defined at all -- this is a real open
 * design gap (the design plan only notes span annotations as a future
 * possibility in §2, without specifying a schema), not something this
 * component works around. Flagged for the user rather than inventing a
 * schema unilaterally; `unit_variable`/`user_variable` types outside of
 * confirm/select_code/scale/annotinder/search_code already fall back to
 * `UnsupportedAnswerField` for the same reason.
 */
export function UnitFields({ layout, data }: { layout: UnitLayout; data: UnitData }) {
  if (!layout.grid) {
    return (
      <div className="flex flex-col gap-4">
        {layout.fields.map((field) => (
          <UnitField key={field.name} field={field} data={data} />
        ))}
      </div>
    );
  }

  const { areas, rows, columns } = layout.grid;
  const style: CSSProperties = {
    display: "grid",
    gridTemplateAreas: areas.map((row) => `"${row.join(" ")}"`).join(" "),
    gridTemplateRows: rows?.map((r) => `${r}fr`).join(" "),
    gridTemplateColumns: columns?.map((c) => `${c}fr`).join(" "),
    gap: "1rem",
  };

  return (
    <div style={style}>
      {layout.fields.map((field) => (
        <div key={field.name} style={{ gridArea: field.name }}>
          <UnitField field={field} data={data} />
        </div>
      ))}
    </div>
  );
}

function UnitField({ field, data }: { field: UnitField; data: UnitData }) {
  const fieldStyle = field.style as CSSProperties | undefined;

  if (field.type === "text") {
    const value = data[field.column];
    return (
      <p style={fieldStyle} className="whitespace-pre-wrap">
        {field.context_before}
        {value !== undefined ? String(value) : ""}
        {field.context_after}
      </p>
    );
  }

  if (field.type === "markdown") {
    return (
      <div style={fieldStyle}>
        <SimpleMarkdown text={renderTemplate(field.template, data)} />
      </div>
    );
  }

  // field.type === "image"
  const src = data[field.column];
  return (
    <figure style={fieldStyle}>
      {src !== undefined && <img src={String(src)} alt={field.alt ?? ""} className="max-w-full" />}
      {field.caption && <figcaption className="text-sm text-gray-500">{field.caption}</figcaption>}
    </figure>
  );
}
