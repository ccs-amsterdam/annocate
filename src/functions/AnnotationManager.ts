import {
  Annotation,
  AnnotationDictionary,
  AnnotationID,
  AnnotationLibrary,
  AnnotationMap,
  AnnotationRelation,
  Answer,
  Code,
  CodeHistory,
  CodeMap,
  ExtendedCodebook,
  ExtendedVariable,
  SetState,
  Span,
  Token,
  TokenAnnotations,
  Unit,
  ValidRelation,
  VariableMap,
  VariableValueMap,
} from "@/app/types";
import { getColor } from "@/functions/tokenDesign";
import cuid from "cuid";
import randomColor from "randomcolor";
import { useEffect, useState } from "react";
import checkConditions from "./checkConditions";
import { addAnnotationsFromAnswer } from "./mapAnswersToAnnotations";

export function useAnnotationManager(unit: Unit, codebook: ExtendedCodebook) {
  const [annotationLib, setAnnotationLib] = useState<AnnotationLibrary>(() =>
    createAnnotationLibrary(unit, codebook, unit.unit.annotations || []),
  );
  const [annotationManager] = useState<AnnotationManager>(() => new AnnotationManager(setAnnotationLib));

  useEffect(() => {
    setAnnotationLib(createAnnotationLibrary(unit, codebook, unit.unit.annotations || []));
  }, [unit, codebook]);

  return { annotationLib, annotationManager };
}

export default class AnnotationManager {
  setAnnotationLib: SetState<AnnotationLibrary>;

  constructor(setAnnotationLib: SetState<AnnotationLibrary>) {
    this.setAnnotationLib = setAnnotationLib;
  }

  addAnnotation(annotation: Annotation) {
    this.setAnnotationLib((annotationLib: AnnotationLibrary) => {
      annotation.positions = getTokenPositions(annotationLib.annotations, annotation);

      let annotations = { ...annotationLib.annotations };
      annotations[annotation.id] = annotation;
      annotations = rmEmptySpan(annotations, annotation);

      return {
        ...annotationLib,
        annotations,
        codeHistory: updateCodeHistory(annotationLib.codeHistory, annotation),
        byToken: newTokenDictionary(annotations),
        conditionReport: checkConditions(annotationLib),
      };
    });
  }

  rmAnnotation(id: AnnotationID, keep_empty: boolean = false) {
    this.setAnnotationLib((annotationLib) => {
      let annotations = { ...annotationLib.annotations };

      if (!annotations?.[id]) return annotationLib;
      if (keep_empty) annotations = addEmptySpan(annotations, id);
      delete annotations[id];

      annotations = rmBrokenRelations(annotations);

      return { ...annotationLib, annotations, byToken: newTokenDictionary(annotations) };
    });
  }

  annotationFromAnswer(answer: Answer) {
    this.setAnnotationLib((annotationLib) => {
      const annotationsArray = addAnnotationsFromAnswer(answer, Object.values(annotationLib.annotations));
      const annotations: AnnotationDictionary = {};
      annotationsArray.forEach((a) => (annotations[a.id] = a));

      return { ...annotationLib, annotations, byToken: newTokenDictionary(annotations) };
    });
  }

  createUnitAnnotation(variable: string, code: Code) {
    const annotation: Annotation = {
      id: cuid(),
      created: new Date().toISOString(),
      type: "unit",
      variable: variable,
      code: code.code,
      value: code.value,
      color: code.color,
    };
    this.addAnnotation(annotation);
  }

  createFieldAnnotation(variable: string, code: Code, field: string) {
    const annotation: Annotation = {
      id: cuid(),
      created: new Date().toISOString(),
      type: "field",
      variable: variable,
      code: code.code,
      value: code.value,
      color: code.color,
      field: field,
    };
    this.addAnnotation(annotation);
  }

  processAnswer(variable: string, code: Code, multiple: boolean, field?: string) {
    let annotation: Annotation = {
      id: cuid(),
      created: new Date().toISOString(),
      type: "unit",
      variable: variable,
      code: code.code,
      value: code.value,
      color: code.color,
    };
    if (field) {
      annotation = { ...annotation, field, type: "field" };
    }

    this.setAnnotationLib((annotationLib) => {
      const currentAnnotations = Object.values(annotationLib.annotations);
      for (const a of currentAnnotations) {
        if (a.variable !== annotation.variable) continue;
        if (a.type !== annotation.type) continue;
        if (annotation.type === "field" && a.type === "field" && a.field !== annotation.field) continue;
        if (a.code === annotation.code || !multiple) {
          delete annotationLib.annotations[a.id];
        }
      }
      annotationLib.annotations[annotation.id] = annotation;

      return {
        ...annotationLib,
        byToken: newTokenDictionary(annotationLib.annotations),
        codeHistory: updateCodeHistory(annotationLib.codeHistory, annotation),
        conditionReport: checkConditions(annotationLib),
      };
    });
  }

  createSpanAnnotation(variable: string, code: Code, from: number, to: number, tokens: Token[]) {
    const annotation: Annotation = {
      id: cuid(),
      created: new Date().toISOString(),
      type: "span",
      variable: variable,
      code: code.code,
      value: code.value,
      color: code.color,
      span: [from, to],
      offset: tokens[from].offset,
      length: tokens[to].length + tokens[to].offset - tokens[from].offset,
      field: tokens[from].field,
      text: getSpanText([from, to], tokens),
    };
    this.addAnnotation(annotation);
  }

  createRelationAnnotation(variable: string, code: Code, from: Annotation, to: Annotation) {
    if (!from.id || !to.id) throw new Error("Cannot create relation annotation without ids");
    const annotation: Annotation = {
      id: cuid(),
      created: new Date().toISOString(),
      type: "relation",
      variable: variable,
      code: code.code,
      value: code.value,
      color: code.color,
      fromId: from.id,
      toId: to.id,
    };
    this.addAnnotation(annotation);
  }

  rerenderAnnotations() {
    this.setAnnotationLib((annotationLib) => {
      return { ...annotationLib };
    });
  }
}

export function createAnnotationLibrary(
  unit: Unit,
  codebook: ExtendedCodebook,
  annotations: Annotation[],
): AnnotationLibrary {
  const variableMap = createVariableMap(codebook.variables || []);
  let annotationArray = annotations || [];
  annotationArray = annotationArray.map((a) => ({ ...a }));

  annotationArray = repairAnnotations(annotationArray, variableMap);
  annotationArray = addTokenIndices(annotationArray, unit.unit.tokens || []);
  const annotationDict: AnnotationDictionary = {};

  for (let a of annotationArray) {
    annotationDict[a.id] = a;
  }

  for (let a of Object.values(annotationDict) || []) {
    a.positions = getTokenPositions(annotationDict, a);
  }

  return {
    type: unit.unitType,
    status: unit.status,
    conditionals: unit.conditionals || [],
    annotations: annotationDict,
    byToken: newTokenDictionary(annotationDict),
    codeHistory: initializeCodeHistory(annotationArray),
    unitId: unit.unitId,
    conditionReport: unit.report || null,
  };
}

function newTokenDictionary(annotations: AnnotationDictionary) {
  const byToken: TokenAnnotations = {};
  for (let annotation of Object.values(annotations)) {
    addToTokenDictionary(byToken, annotation);
  }
  return byToken;
}

function addToTokenDictionary(byToken: TokenAnnotations, annotation: Annotation) {
  if (!annotation.positions) return;
  annotation.positions.forEach((i) => {
    if (!byToken[i]) byToken[i] = [];
    byToken[i].push(annotation.id);
  });
}

function updateCodeHistory(codeHistory: CodeHistory, annotation: Annotation) {
  const { variable, code: value } = annotation;
  if (!codeHistory?.[variable]) codeHistory[variable] = [];

  let values: (string | number)[] = [];
  if (value) {
    values = [value, ...codeHistory[variable].filter((v: string | number) => v !== value)];
  } else {
    values = codeHistory[variable];
  }

  return {
    ...codeHistory,
    [variable]: values,
  };
}

function rmBrokenRelations(annDict: AnnotationDictionary) {
  const nBefore = Object.keys(annDict).length;
  for (let a of Object.values(annDict)) {
    if (a.type !== "relation") continue;
    if (!("fromId" in a && "toId" in a)) continue;
    if (!annDict[a.fromId] || !annDict[a.toId]) delete annDict[a.id];
  }

  // if relations were removed, we need to repeat the procedure to see
  // if other relations refered to the now missing ones
  if (Object.keys(annDict).length < nBefore) return rmBrokenRelations(annDict);

  return annDict;
}

/**
 * Uses the annotation offset and length to find the token indices for span annotations
 */
export const addTokenIndices = (annotations: Annotation[], tokens: Token[]) => {
  const annMap: AnnotationMap = {};

  // first add the span token indices, and simultaneously create an annotation map
  for (let a of annotations || []) {
    if (a.type === "span") {
      const from = getIndexFromOffset(tokens, a.field, a.offset);
      const to = getIndexFromOffset(tokens, a.field, a.offset + a.length - 1);
      if (from !== null && to !== null) {
        a.span = [from, to];
        if (!a.text) a.text = getSpanText(a.span, tokens);
      }
    }
    annMap[a.id] = a;
  }

  return annotations;
};

function getIndexFromOffset(tokens: Token[], field: string, offset: number) {
  for (let token of tokens) {
    if (token.field !== field) continue;
    if (token.offset + token.length > offset) return token.index;
  }
  return null;
}

const initializeCodeHistory = (annotations: Annotation[]): CodeHistory => {
  const vvh: VariableValueMap = {};

  for (let annotation of annotations) {
    if (!annotation.code) continue;
    if (!vvh[annotation.variable]) {
      vvh[annotation.variable] = { [annotation.code]: true };
    } else {
      vvh[annotation.variable][annotation.code] = true;
    }
  }

  const codeHistory: CodeHistory = {};
  for (let variable of Object.keys(vvh)) {
    codeHistory[variable] = Object.keys(vvh[variable]);
  }

  return codeHistory;
};

const getSpanText = (span: Span, tokens: Token[]) => {
  const text = tokens
    .slice(span[0], span[1] + 1)
    .map((t: Token, i: number) => {
      let string = t.text;

      if (i > 0) string = t.pre + string;
      if (i < span[1] - span[0]) string = string + t.post;
      return string;
    })
    .join("");
  return text;
};

function getTokenPositions(
  annotations: AnnotationDictionary,
  annotation: Annotation,
  positions: Set<number> = new Set(),
) {
  if (!positions) positions = new Set<number>();

  if (annotation.type === "span") {
    if (!annotation.span) {
      console.error("Span annotation without span", annotation);
      return positions;
    }
    for (let i = annotation.span[0]; i <= annotation.span[1]; i++) {
      positions.add(i);
    }
  }
  if (annotation.type === "relation") {
    // recursively get the spans, and add the annotationId there
    getTokenPositions(annotations, annotations[annotation.fromId], positions);
    getTokenPositions(annotations, annotations[annotation.toId], positions);
  }
  return positions;
}

function repairAnnotations(annotations: Annotation[], variableMap?: VariableMap) {
  for (let a of Object.values(annotations)) {
    if (variableMap) {
      const codeMap = variableMap[a.variable].codeMap;
      if (a.code != null && codeMap[a.code]) {
        a.color = getColor(a.code, codeMap);
      }
    }

    if (!a.color) {
      if (!a.color) a.color = randomColor({ seed: a.code, luminosity: "light" });
    }
  }

  return annotations;
}

function addEmptySpan(annotations: AnnotationDictionary, id: AnnotationID) {
  // check if this is the last annotation at this span. If not, don't add empty span
  const annotation = annotations[id];
  if (!annotation) return annotations;

  for (let a of Object.values(annotations)) {
    if (a.type !== "span" || annotation.type !== "span") continue;
    if (!a.span || !annotation.span) continue;
    if (a.id === annotation.id) continue;

    if (
      a.field === annotation.field &&
      a.variable === annotation.variable &&
      a.span[0] === annotation.span[0] &&
      a.span[1] === annotation.span[1]
    )
      return annotations;
  }

  const emptyAnnotation = {
    ...annotations[id],
    id: cuid(),
    value: "EMPTY",
    color: "grey",
  };
  annotations[emptyAnnotation.id] = emptyAnnotation;
  return annotations;
}

function rmEmptySpan(annotations: AnnotationDictionary, annotation: Annotation) {
  // check if this has the same position as an empty span. If so, remove the empty span
  for (let a of Object.values(annotations)) {
    if (a.type !== "span" || annotation.type !== "span") continue;
    if (!a.span || !annotation.span) continue;
    if (a.code !== "EMPTY") continue;
    if (
      a.field === annotation.field &&
      a.variable === annotation.variable &&
      a.span[0] === annotation.span[0] &&
      a.span[1] === annotation.span[1]
    ) {
      delete annotations[a.id];
    }
  }

  return annotations;
}

function createVariableMap(variables: ExtendedVariable[]) {
  const vm: any = {};
  for (let variable of variables) {
    let cm = variable.codeMap;
    cm = Object.keys(cm).reduce((obj: any, key) => {
      obj[key] = cm[key];
      return obj;
    }, {});

    vm[variable.name] = { ...variable, codeMap: cm };

    if (variable.type === "relation") {
      const [validFrom, validTo] = getValidRelationCodes(variable.relations, variable.codeMap);
      vm[variable.name].validFrom = validFrom;
      vm[variable.name].validTo = validTo;
    }
  }

  return vm;
}

/**
 * If variable of type relation, prepare efficient lookup for
 * valid from/to annotations
 */
function getValidRelationCodes(relations: AnnotationRelation[], codeMap: CodeMap) {
  if (!relations) return [null, null];
  const validFrom: ValidRelation = {};
  const validTo: ValidRelation = {};

  function addValidRelation(
    valid: ValidRelation,
    relationId: number,
    codes: Code[],
    variable?: string,
    values?: string[],
  ) {
    if (!variable) {
      if (!valid["*"]) valid["*"] = { "*": {} };
      valid["*"]["*"][relationId] = codes;
      return;
    }
    if (!valid[variable]) valid[variable] = {};
    // if we include a code_id, which is just the relation index, we can use that
    // to connect the from/to values

    if (values) {
      for (let value of values) {
        if (!valid[variable][value]) valid[variable][value] = {};
        valid[variable][value][relationId] = codes;
      }
    } else {
      if (!valid[variable]["*"]) valid[variable]["*"] = {};
      valid[variable]["*"][relationId] = codes;
    }
  }

  for (let i = 0; i < relations.length; i++) {
    const relation = relations[i];
    if (!relation.codes) relation.codes = Object.keys(codeMap).map((code) => ({ code }));
    const codes: Code[] = [];
    for (let code of relation.codes) if (codeMap[code.code]) codes.push(codeMap[code.code]);
    addValidRelation(validFrom, i, codes, relation?.from?.variable, relation?.from?.values);
    addValidRelation(validTo, i, codes, relation?.to?.variable, relation?.to?.values);
  }

  return [validFrom, validTo];
}