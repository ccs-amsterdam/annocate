import {
  Annotation,
  AnnotationDictionary,
  AnnotationID,
  AnnotationLibrary,
  AnnotationsByToken,
  Unit,
  VariableAnnotationsMap,
  VariableMap,
} from "@/app/types";
import cuid from "cuid";
import { getColor } from "../tokenDesign";

export function createAnnotationLibrary(
  unit: Unit | null,
  variableMap: VariableMap,
  globalAnnotations: VariableAnnotationsMap | undefined,
  focusVariableIndex?: number,
): AnnotationLibrary {
  const annotations: Annotation[] = [];
  if (unit?.variableAnnotations) {
    Object.values(unit.variableAnnotations).map((variable) => annotations.push(...variable.annotations));
  }
  if (globalAnnotations) {
    Object.values(globalAnnotations).map((variable) => annotations.push(...variable.annotations));
  }

  let annotationArray = annotations || [];
  annotationArray = annotationArray.map((a) => ({ ...a }));

  annotationArray = repairAnnotations(annotationArray, variableMap);

  if (unit) {
    // TODO: implement the tokens stuff here.
    // We'll only allow tokens directly on data fields (no templating). So we can check
    // the codebook to find any token layouts
    // annotationArray = addTokenIndices(annotationArray, unit.content.tokens || []);
  }

  const annotationDict: AnnotationDictionary = {};
  for (let a of annotationArray) {
    annotationDict[a.id] = a;
  }

  // This step is needed for span annotations. But it first requires addTokenIndices (span cannot be undefined)
  // for (let a of Object.values(annotationDict) || []) {
  //   a.client.positions = getTokenPositions(annotationDict, a);
  // }

  return {
    sessionId: cuid(),
    phaseToken: unit?.token || "global",
    annotations: annotationDict,
    byToken: newTokenDictionary(annotationDict),
    byVariable: variableAnnotations(annotationDict),
    codeHistory: {},
    // previousIndex: 0,
  };
}

export function newTokenDictionary(annotations: AnnotationDictionary) {
  const byToken: AnnotationsByToken = {};
  for (let annotation of Object.values(annotations)) {
    addToTokenDictionary(byToken, annotation);
  }
  return byToken;
}

export function variableAnnotations(annotations: AnnotationDictionary) {
  const byVariable: Record<number, AnnotationID[]> = {};
  for (let a of Object.values(annotations)) {
    if (!byVariable[a.variableId]) byVariable[a.variableId] = [];
    byVariable[a.variableId].push(a.id);
  }
  return byVariable;
}

function repairAnnotations(annotations: Annotation[], variableMap?: VariableMap) {
  for (let a of Object.values(annotations)) {
    if (variableMap && variableMap[a.variableId]) {
      const codeMap = variableMap[a.variableId].codeMap;
      if (a.code != null && codeMap[a.code]) {
        a.client.color = getColor(a.code, codeMap);
      }
    }
  }

  return annotations;
}

function addToTokenDictionary(byToken: AnnotationsByToken, annotation: Annotation) {
  if (!annotation.client.positions) return;
  annotation.client.positions.forEach((i) => {
    if (!byToken[i]) byToken[i] = [];
    byToken[i].push(annotation.id);
  });
}

function rmBrokenRelations(annDict: AnnotationDictionary): Annotation[] {
  const nBefore = Object.keys(annDict).length;
  const deleteAnnotations: Annotation[] = [];
  for (let a of Object.values(annDict)) {
    if (a.type !== "relation") continue;
    if (!("fromId" in a && "toId" in a)) continue;
    if (!annDict[a.fromId] || !annDict[a.toId]) {
      deleteAnnotations.push({ ...a, deleted: new Date() });
      delete annDict[a.id];
    }
  }

  // if relations were removed, we need to repeat the procedure to see
  // if other relations refered to the now missing ones
  if (Object.keys(annDict).length < nBefore) {
    deleteAnnotations.push(...rmBrokenRelations(annDict));
    return [...rmBrokenRelations(annDict)];
  }

  return deleteAnnotations;
}
