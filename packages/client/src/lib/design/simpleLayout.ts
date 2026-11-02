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

/** A first guess from the units' fields: a title, a byline and the body by their names; otherwise every text field as body. */
export function guessSimpleLayout(textFields: string[]): SimpleLayout {
  const find = (pattern: RegExp) => textFields.find((f) => pattern.test(f));
  const title = find(/^(title|headline|heading|kop)$/i);
  const byline = find(/^(byline|author|source|date|bron)$/i);
  const body = textFields.filter((f) => f !== title && f !== byline);
  return { ...(title ? { title } : {}), ...(byline ? { byline } : {}), body };
}
