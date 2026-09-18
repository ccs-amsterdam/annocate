import type { Root } from "mdast";
import { visit } from "unist-util-visit";

/**
 * A remark plugin (design plan §11c) that converts the `::field[column]`
 * leaf directive (parsed by `remark-directive`) into a node react-markdown
 * can map to a custom component via its `components` prop.
 *
 * Sets `hName`/`hProperties` (the mechanism `remark-rehype` -- and, by
 * extension, `react-markdown` -- uses to control the resulting element/
 * component for a given mdast node), so `::field[headline]{as="image"}`
 * becomes `<unit-field column="headline" as="image" />`.
 */
export function remarkUnitField() {
  return (tree: Root) => {
    visit(tree, (node) => {
      if (node.type !== "leafDirective" || (node as { name?: string }).name !== "field") return;
      const directive = node as unknown as {
        children?: { type: string; value?: string }[];
        attributes?: Record<string, string | null | undefined>;
        data?: Record<string, unknown>;
      };
      const column = directive.children?.find((c) => c.type === "text")?.value;
      directive.data ??= {};
      directive.data.hName = "unit-field";
      directive.data.hProperties = { column, as: directive.attributes?.as };
    });
  };
}
