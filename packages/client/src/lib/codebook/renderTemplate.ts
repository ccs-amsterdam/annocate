import type { UnitData } from "@annotinder/contracts";

/**
 * Minimal `{{column}}` substitution for markdown field templates (design
 * plan's `MarkdownFieldSchema.template`). Intentionally NOT a full templating
 * engine (no conditionals/loops) -- codebook authors get simple variable
 * interpolation only, matching the old `AnnotationInterface` UX intent.
 */
export function renderTemplate(template: string, data: UnitData): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    const value = data[key];
    return value === undefined ? "" : String(value);
  });
}
