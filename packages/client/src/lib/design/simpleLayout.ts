// A unit's layout as a simple form (docs/client.md §3): which field is the
// title, the byline and the body. The form writes an ordinary template;
// a template is shown as the form only if it has exactly that shape, so
// nothing written in the template editor is lost.

export interface SimpleLayout {
  /** A field shown as the heading. */
  title?: string;
  /** A field shown small, in italics, under the title (e.g. source and date). */
  byline?: string;
  /** Fields shown as the text, in order. */
  body: string[];
}

/** The template for a simple layout. */
export function simpleTemplate(layout: SimpleLayout): string {
  const blocks: string[] = [];
  if (layout.title) blocks.push(`# $unit.${layout.title}`);
  if (layout.byline) blocks.push(`*$unit.${layout.byline}*`);
  for (const field of layout.body) blocks.push(`$unit.${field}`);
  return blocks.join("\n\n");
}

const FIELD = "([A-Za-z_][A-Za-z0-9_]*)";
const TITLE = new RegExp(`^# \\$unit\\.${FIELD}$`);
const BYLINE = new RegExp(`^\\*\\$unit\\.${FIELD}\\*$`);
const BODY = new RegExp(`^\\$unit\\.${FIELD}$`);

/** The simple layout a template is, or null if it is more than the form can show. */
export function parseSimpleLayout(template: string): SimpleLayout | null {
  const blocks = template
    .trim()
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const layout: SimpleLayout = { body: [] };
  let i = 0;
  const title = blocks[i]?.match(TITLE);
  if (title) {
    layout.title = title[1];
    i++;
  }
  const byline = blocks[i]?.match(BYLINE);
  if (byline) {
    layout.byline = byline[1];
    i++;
  }
  for (; i < blocks.length; i++) {
    const body = blocks[i].match(BODY);
    if (!body) return null;
    layout.body.push(body[1]);
  }
  return layout;
}

/** A place in the sketch: title and byline hold one field, the body any number. */
export type LayoutSlot = "title" | "byline" | "body";

/** The fields a layout shows, in order. */
export function placedFields(layout: SimpleLayout): string[] {
  return [layout.title, layout.byline, ...layout.body].filter((f): f is string => !!f);
}

/** The layout without `field`, wherever it was. */
export function removeField(layout: SimpleLayout, field: string): SimpleLayout {
  const next: SimpleLayout = { ...layout, body: layout.body.filter((f) => f !== field) };
  if (next.title === field) delete next.title;
  if (next.byline === field) delete next.byline;
  return next;
}

/**
 * Puts `field` in a place, taking it from where it was: in the title or
 * byline it replaces the field there (which goes back to the unplaced
 * ones); in the body it goes before position `at` (default: last).
 */
export function placeField(layout: SimpleLayout, field: string, slot: LayoutSlot, at?: number): SimpleLayout {
  if (slot !== "body") return { ...removeField(layout, field), [slot]: field };
  // The position counts the body as it is, so moving a field down keeps its target
  const from = layout.body.indexOf(field);
  const next = removeField(layout, field);
  let index = at ?? next.body.length;
  if (from >= 0 && at !== undefined && from < at) index -= 1;
  index = Math.max(0, Math.min(index, next.body.length));
  return { ...next, body: [...next.body.slice(0, index), field, ...next.body.slice(index)] };
}

/** The layout with only the fields that exist (e.g. after other units were uploaded). */
export function keepFields(layout: SimpleLayout, fields: readonly string[]): SimpleLayout {
  return placedFields(layout)
    .filter((f) => !fields.includes(f))
    .reduce(removeField, layout);
}
