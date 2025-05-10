import {
  AnnotationLibrary,
  CodebookVariable,
  TokenSelection,
  ValidTokenDestinations,
  ValidTokenRelations,
} from "@/app/types";

export const getValidTokenRelations = (
  annotationLib: AnnotationLibrary,
  variable: CodebookVariable,
): ValidTokenRelations | null => {
  if (variable.type !== "relation") return null;

  const valid: ValidTokenRelations = {};

  for (let key of Object.keys(annotationLib.byToken)) {
    const i = parseInt(key);
    for (let id of annotationLib.byToken[i]) {
      const a = annotationLib.annotations[id];
      if (!a.variableId || !a.code) continue;

      const wildcard = variable?.validFrom?.[a.variableId]?.["*"];
      const relationIds = wildcard || variable?.validFrom?.[a.variableId]?.[a.code] || null;

      if (!relationIds) continue;
      if (!valid[i]) valid[i] = {};

      const fromKey = a.variableId + "|" + a.code;
      if (!valid[i][fromKey]) valid[i][fromKey] = {};

      for (let relationIdKey of Object.keys(relationIds)) {
        const relationId = parseInt(relationIdKey);
        const to = variable.relations?.[relationId]?.to;
        const toKeyWildcard = to?.variable + "|*";
        if (!!wildcard) valid[i][fromKey][toKeyWildcard] = true;
        for (let value of to?.values || []) {
          const toKey = to?.variable + "|" + value;
          valid[i][fromKey][toKey] = true;
        }
      }
    }
  }

  return valid;
};

export const getValidTokenDestinations = (
  annotationLib: AnnotationLibrary,
  validRelations: ValidTokenRelations,
  tokenSelection: TokenSelection,
): ValidTokenDestinations | null => {
  if (!tokenSelection?.[0] || !tokenSelection?.[1] || !validRelations?.[tokenSelection[0]]) return null;

  const valid: ValidTokenDestinations = {};
  const validIds = validRelations?.[tokenSelection[0]];
  if (!validIds) return valid;

  const startAnnotationIds = annotationLib.byToken[tokenSelection[0]] || [];
  const startAnnotations = startAnnotationIds.map((id) => annotationLib.annotations[id]);

  for (let sa of startAnnotations) {
    const fromKey = sa.variableId + "|" + sa.code;
    if (!validIds[fromKey]) continue; // skip if there are no destinations at all

    for (let key of Object.keys(annotationLib.byToken)) {
      const i = parseInt(key);
      const destinationAnnotationIds = annotationLib.byToken[i];
      for (let destinationId of destinationAnnotationIds) {
        const da = annotationLib.annotations[destinationId];
        const toKey = da.variableId + "|" + da.code;
        const toKeyWildcard = da.variableId + "|*";
        if (!validIds[fromKey][toKey] && !validIds[fromKey][toKeyWildcard]) continue; // skip if there are no destinations for this variable/value
        if (da.variableId === sa.variableId && da.code === sa.code) {
          if (da.type === "span" && sa.type === "span") {
            if (da.offset === sa.offset && da.length === sa.length) continue;
          } else {
            continue;
          }
        }
        valid[i] = true;
      }
    }
  }

  return valid;
};
