import type { Nodes, Parent, Root, RootContent } from "mdast";
import { PLACEHOLDER, type TemplateValue } from "./renderTemplate";

/**
 * A remark plugin (docs/client.md §3) that turns the placeholders of a
 * prepared template (`prepareTemplate`) into `<template-value index=N>`
 * elements, which `TemplateMarkdown` renders by the value's type. A
 * paragraph holding only a block value becomes that value. Placeholders in
 * link and image URLs, titles and alt texts are filled in with the value's
 * text.
 */
export function remarkTemplateValues(values: TemplateValue[]) {
  const fill = (s: string) => s.replace(PLACEHOLDER, (_, i: string) => values[Number(i)]?.text ?? "");
  const element = (index: number, block: boolean) =>
    ({
      type: "templateValue",
      data: { hName: "template-value", hProperties: { index: String(index), block: String(block) } },
    }) as unknown as RootContent;

  const transform = (node: Nodes) => {
    if (node.type === "link" || node.type === "image" || node.type === "definition") {
      node.url = fill(node.url);
      if (node.title) node.title = fill(node.title);
    }
    if (node.type === "image" && node.alt) node.alt = fill(node.alt);
    if (!("children" in node)) return;
    const parent = node as Parent;
    const children: RootContent[] = [];
    for (const child of parent.children) {
      // A paragraph that is just one block value
      if (child.type === "paragraph" && child.children.length === 1 && child.children[0].type === "text") {
        const match = /^\s*(\d+)\s*$/.exec(child.children[0].value);
        if (match && values[Number(match[1])]?.block) {
          children.push(element(Number(match[1]), true));
          continue;
        }
      }
      if (child.type === "text") {
        let last = 0;
        for (const m of child.value.matchAll(PLACEHOLDER)) {
          if (m.index > last) children.push({ type: "text", value: child.value.slice(last, m.index) });
          children.push(element(Number(m[1]), false));
          last = m.index + m[0].length;
        }
        if (last === 0) children.push(child);
        else if (last < child.value.length) children.push({ type: "text", value: child.value.slice(last) });
        continue;
      }
      transform(child);
      children.push(child);
    }
    parent.children = children;
  };

  return (tree: Root) => transform(tree);
}
