// The inline CSS a design may use (a layout's `style`, `::: style` blocks):
// an allow-list of properties that change how text and boxes look, without
// taking content out of the unit area (no position, z-index, transforms) or
// loading anything (no url(), image-set(), @import). React sets inline
// styles per property, so they can't add selectors or run code.

/** CSS properties a design may set (kebab-case); `margin`, `padding` and `border` include their sides. */
const ALLOWED = new Set([
  "color",
  "background-color",
  "opacity",
  "font-size",
  "font-weight",
  "font-style",
  "font-family",
  "font-variant",
  "line-height",
  "letter-spacing",
  "word-spacing",
  "text-align",
  "text-decoration",
  "text-transform",
  "text-indent",
  "white-space",
  "word-break",
  "overflow-wrap",
  "hyphens",
  "vertical-align",
  "width",
  "min-width",
  "max-width",
  "height",
  "min-height",
  "max-height",
  "display",
  "flex",
  "flex-direction",
  "flex-wrap",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "gap",
  "row-gap",
  "column-gap",
  "align-items",
  "align-self",
  "justify-content",
  "grid-template-columns",
  "grid-column",
  "overflow",
  "overflow-x",
  "overflow-y",
  "box-shadow",
  "border-radius",
  "list-style-type",
]);
const SIDED = /^(margin|padding|border)(-(top|right|bottom|left|inline|block)(-(start|end))?)?(-(width|style|color))?$/;

/** Values that load something or reach outside the declaration. */
const UNSAFE_VALUE = /url\s*\(|image-set\s*\(|expression\s*\(|@import|[<>{}\\]/i;

/** Why a CSS declaration isn't allowed (kebab-case property), or null. */
export function cssProblem(property: string, value: string): string | null {
  if (!ALLOWED.has(property) && !SIDED.test(property))
    return `${property} isn't one of the CSS properties a design can use (colours, fonts, spacing, borders, sizes, flex and grid)`;
  if (UNSAFE_VALUE.test(value)) return `${property}: ${value} isn't allowed (no url(), image-set() or markup)`;
  return null;
}

/** The problems of a style object (camelCase or kebab-case keys, as React styles). */
export function styleProblems(style: Record<string, string>): string[] {
  return Object.entries(style).flatMap(([key, value]) => {
    const property = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    const problem = cssProblem(property, String(value));
    return problem ? [problem] : [];
  });
}
