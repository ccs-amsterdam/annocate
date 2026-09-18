import type { Root } from "mdast";
import { visit } from "unist-util-visit";

const DIRECTIVE_NAMES = new Set(["field", "tokenize"]);

/**
 * A remark plugin (design plan §11c/§11f) that converts the `::field[name]`
 * and `::tokenize[name]` leaf directives (parsed by `remark-directive`) into
 * a node react-markdown can map to a custom component via its `components`
 * prop.
 *
 * `name` resolves against ONE namespace: the current unit's data columns
 * union the layout's `constants` (§11f) -- never a composed/rendered blob --
 * so that a `::tokenize[name]` span's stored character offsets always mean
 * "an offset into this one stable, versioned string", regardless of where
 * in the layout it's referenced.
 *   - `::field[name]` -- "special" (non-tokenizable) rendering: plain text
 *     by default, `{as="image"}` for an image, or `{markdown=true}` to
 *     interpret the value as nested markdown.
 *   - `::tokenize[name]` -- renders the value as plain text, made
 *     interactively span-selectable when the coder is currently answering a
 *     `span` variable targeting that name. Deliberately NOT combinable with
 *     `markdown=true` (see UnitFields.tsx): if the raw string's markdown
 *     syntax were stripped for display, rendered-text positions would no
 *     longer line up with the raw string's character offsets.
 *
 * Sets `hName`/`hProperties` (the mechanism `remark-rehype` -- and, by
 * extension, `react-markdown` -- uses to control the resulting element/
 * component for a given mdast node), so `::field[headline]{as="image"}`
 * becomes `<unit-field mode="field" name="headline" as="image" />`.
 */
export function remarkUnitField() {
  return (tree: Root) => {
    visit(tree, (node) => {
      const name = (node as { name?: string }).name;
      if (node.type !== "leafDirective" || !name || !DIRECTIVE_NAMES.has(name)) return;

      const directive = node as unknown as {
        children?: { type: string; value?: string }[];
        attributes?: Record<string, string | null | undefined>;
        data?: Record<string, unknown>;
      };
      const fieldName = directive.children?.find((c) => c.type === "text")?.value;
      directive.data ??= {};
      directive.data.hName = "unit-field";
      directive.data.hProperties = {
        mode: name,
        name: fieldName,
        as: directive.attributes?.as,
        markdown: directive.attributes?.markdown,
      };
    });
  };
}
