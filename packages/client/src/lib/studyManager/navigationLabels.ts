import { itemName, type DesignItem } from "@annotinder/contracts";

/** How a step is listed in the navigation menu: its question's first line, a loop's label, else its name. */
export function stepLabel(item: DesignItem): string {
  if ("variable" in item && item.variable && "question" in item.variable) {
    const question = item.variable.question;
    if (typeof question === "string" && question.trim().length > 0)
      return plainLabel(question) || (itemName(item) ?? "");
  }
  if (item.type === "unit_loop") return item.label?.trim() || "Units";
  return itemName(item) ?? "";
}

/**
 * A question text's first line as a short plain label: without markdown
 * marks and block fences, and with values and snippets as "…" (they aren't
 * filled in there).
 */
function plainLabel(text: string): string {
  const line = text.split("\n").find((l) => l.trim() && !/^\s*:{3,}/.test(l)) ?? "";
  return line
    .replace(/\{\{[\s\S]*?\}\}(::\w+)?|\$(unit|var)(\.\w+)+(::\w+)?|\[\[\w+\]\]/g, "…")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(#+|>|[-*+]|\d+\.)\s+/, "")
    .replace(/[*_`]/g, "")
    .trim();
}
