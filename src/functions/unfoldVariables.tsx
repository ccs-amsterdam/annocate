import { Unit, Codebook, ExtendedCodebook, Question, ExtendedUnit, Variable } from "@/app/types";
import { importCodebook } from "./codebook";

/**
 * Codebooks can indicate that certain questions need to be asked
 * multiple times, e.g., per annotation. If so, the questions
 * need to be 'unfolded'.
 *
 * @param codebook
 * @param unit
 * @returns
 */
export default function unfoldVariables(codebook: ExtendedCodebook, unit: Unit): ExtendedCodebook {
  if (!codebook?.variables) return codebook;

  let needsUnfold = false;
  for (let variable of codebook.variables) {
    if (variable.perAnnotation && unit.annotations.length > 0) needsUnfold = true;
    if (variable.perField) needsUnfold = true;
  }
  if (!needsUnfold) return codebook;

  const variables = [];
  for (let variable of codebook.variables) {
    if (!variable.perAnnotation && !variable.perField) {
      variables.push(variable);
      continue;
    }

    // perAnnotation
    const duplicate: Record<string, boolean> = {};
    for (let a of unit.annotations) {
      if (!variable?.perAnnotation?.includes(a.variable)) continue;

      const aSerial: string = JSON.stringify(a);
      if (duplicate[aSerial]) continue;
      duplicate[aSerial] = true;

      const q = { ...variable, annotation: a };
      if (variable.focusAnnotations && "field" in a && a.field) q.fields = [a.field];
      variables.push(q);
    }

    // perField
    if (variable.perField) {
      if (!Array.isArray(variable.perField)) variable.perField = [variable.perField];

      const fields = new Set<string>([]);
      for (let f of unit.content.text_fields || []) fields.add(f.name);
      for (let f of unit.content.markdown_fields || []) fields.add(f.name);
      for (let f of unit.content.image_fields || []) fields.add(f.name);

      for (let field of Array.from(fields)) {
        // perField can match on both the exact field and field ignoring any \.[0-9]+ extension.
        // this allows e.g., matching 'comment' on fields 'comment.1','comment.2', etc.
        const fieldWithoutNr = field.replace(/[.][0-9]+$/, "");
        if (variable.perField.includes(fieldWithoutNr) || variable.perField.includes(field)) {
          variables.push({ ...variable, fields: [field] });
        }
      }
    }
  }

  return importCodebook({ ...codebook, variables });
}
