import {
  Annotation,
  AnnotationDictionary,
  AnnotationID,
  AnnotationLibrary,
  AnnotationMap,
  AnnotationRelation,
  Code,
  CodeHistory,
  CodeMap,
  ExtendedCodebook,
  ExtendedVariable,
  JobServer,
  SetState,
  Span,
  Status,
  Token,
  TokenAnnotations,
  ValidRelation,
  VariableMap,
  VariableStatus,
  VariableValueMap,
  Unit,
} from "@/app/types";
import { UnitBundle } from "@/components/AnnotatorProvider/AnnotatorProvider";
import { getColor } from "@/functions/tokenDesign";
import cuid from "cuid";
import randomColor from "randomcolor";
import { toast } from "sonner";

export default class AnnotationManager {
  postAnnotations: (status: Status) => Promise<Status>;
  annotationLib: AnnotationLibrary;
  setUnitBundle?: SetState<UnitBundle | null>;
  lastAnnotationIds: string[];

  constructor() {
    this.annotationLib = {
      sessionId: "initializing",
      type: "annotation",
      status: "IN_PROGRESS",
      annotations: {},
      byToken: {},
      codeHistory: {},
      variables: [],
      variableIndex: 0,
      variableStatuses: [],
      previousIndex: 0,
    };
    this.lastAnnotationIds = [];
    this.postAnnotations = async (status: Status) => status as Status;
  }

  initialize({
    jobServer,
    unit,
    codebook,
    setUnitBundle,
    variableIndex,
  }: {
    jobServer: JobServer;
    unit: Unit;
    codebook: ExtendedCodebook;
    setUnitBundle: SetState<UnitBundle | null>;
    variableIndex?: number;
  }) {
    // TODO
    // Here add step where we perform any needed tokenization, based on any tokenization settings in codebook
    // This is needed in createAnnotationLibrary to match annotations to tokenindices

    this.annotationLib = createAnnotationLibrary(jobServer, unit, codebook, unit.annotations, variableIndex);
    this.lastAnnotationIds = Object.keys(this.annotationLib.annotations);
    this.setUnitBundle = setUnitBundle;
    this.postAnnotations = async (status: Status) => {
      try {
        const add: AnnotationDictionary = { ...this.annotationLib.annotations };
        const rmIds: string[] = [];
        for (let id of this.lastAnnotationIds) {
          if (!add[id]) rmIds.push(id);
          delete add[id];
        }

        const resStatus = await jobServer.postAnnotations(unit.token, add, rmIds, status);
        this.lastAnnotationIds = Object.keys(this.annotationLib.annotations);
        return resStatus;
      } catch (e) {
        console.error("Error posting annotations", e);
        toast.error("Error posting annotations");
        return "IN_PROGRESS";
      }
    };
  }

  updateAnnotationLibrary(annotationLib: AnnotationLibrary) {
    this.annotationLib = annotationLib;
    this.setUnitBundle?.((unitBundle) => (unitBundle ? { ...unitBundle, annotationLib: { ...annotationLib } } : null));
  }

  async postVariable(finished: boolean) {
    const varName = topVarName(this.annotationLib.variables[this.annotationLib.variableIndex].name);

    if (!finished) {
      // this is for intermediate saving of results, so only post
      const status = await this.postAnnotations("IN_PROGRESS");
      return { status, conditionReport: null };
    }

    // if variable finished, also set done status to each annotation of current variable
    for (let a of Object.values(this.annotationLib.annotations)) {
      if (topVarName(a.variable) === varName) {
        if (finished) a.status = "done";
      }
    }

    const anyLeft = this.annotationLib.variableStatuses.some(
      (s, i) => s !== "skip" && i > this.annotationLib.variableIndex,
    );

    if (!anyLeft) {
      // if no more variables left, submit the annotations and go to next unit
      const status = await this.postAnnotations("DONE");
      return { status, conditionReport: null };
    }

    // submit the current variable and go to next variableIndex
    const status = await this.postAnnotations("IN_PROGRESS");
    this.annotationLib.variableStatuses[this.annotationLib.variableIndex] = "done";
    this.annotationLib.variableStatuses = [...this.annotationLib.variableStatuses];
    this.updateAnnotationLibrary(this.annotationLib);
    this.setVariableIndex(this.annotationLib.variableIndex + 1);
    return { status, conditionReport: null };
  }

  setVariableIndex(index: number) {
    this.updateAnnotationLibrary({
      ...this.annotationLib,
      previousIndex: this.annotationLib.variableIndex,
      variableIndex: index,
    });
  }

  addAnnotation(annotation: Annotation) {
    annotation.positions = getTokenPositions(this.annotationLib.annotations, annotation);

    let annotations = { ...this.annotationLib.annotations };
    annotations[annotation.id] = annotation;
    annotations = rmEmptySpan(annotations, annotation);

    this.updateAnnotationLibrary({
      ...this.annotationLib,
      annotations,
      codeHistory: updateCodeHistory(this.annotationLib.codeHistory, annotation),
      byToken: newTokenDictionary(annotations),
    });
  }

  rmAnnotation(id: AnnotationID, keep_empty: boolean = false) {
    let annotations = { ...this.annotationLib.annotations };

    if (!annotations?.[id]) return;
    if (keep_empty) annotations = addEmptySpan(annotations, id);
    delete annotations[id];

    annotations = rmBrokenRelations(annotations);

    this.updateAnnotationLibrary({ ...this.annotationLib, annotations, byToken: newTokenDictionary(annotations) });
  }

  // createUnitAnnotation(variable: string, code: Code) {
  //   const annotation: Annotation = {
  //     id: cuid(),
  //     created: new Date().toISOString(),
  //     type: "unit",
  //     variable: variable,
  //     code: code.code,
  //     value: code.value,
  //     color: code.color,
  //   };
  //   this.addAnnotation(annotation);
  // }

  // createFieldAnnotation(variable: string, code: Code, field: string) {
  //   const annotation: Annotation = {
  //     id: cuid(),
  //     created: new Date().toISOString(),
  //     type: "field",
  //     variable: variable,
  //     code: code.code,
  //     value: code.value,
  //     color: code.color,
  //     field: field,
  //   };
  //   this.addAnnotation(annotation);
  // }

  processAnswer(variable: string, code: Code, multiple: boolean = false, fields?: string[]) {
    let annotation: Annotation = {
      id: cuid(),
      created: new Date().toISOString(),
      type: "unit",
      status: "pending",
      variable: variable,
      code: code.code,
      value: code.value,
      color: code.color,
    };
    if (fields) {
      annotation = { ...annotation, field: fields.join("|"), type: "field" };
    }

    let addAnnotation = true;

    const currentAnnotations = Object.values(this.annotationLib.annotations);
    const newAnnotations: Record<string, Annotation> = { ...this.annotationLib.annotations };
    for (const a of currentAnnotations) {
      if (a.variable !== annotation.variable) continue;
      if (a.type !== annotation.type) continue;
      if (annotation.type === "field" && a.type === "field" && a.field !== annotation.field) continue;

      if (a.code === annotation.code) {
        addAnnotation = false;
        if (multiple) delete newAnnotations[a.id];
      } else {
        if (!multiple) delete newAnnotations[a.id];
      }
    }

    if (addAnnotation) newAnnotations[annotation.id] = annotation;

    this.updateAnnotationLibrary({
      ...this.annotationLib,
      annotations: newAnnotations,
      byToken: newTokenDictionary(this.annotationLib.annotations),
      codeHistory: updateCodeHistory(this.annotationLib.codeHistory, annotation),
    });
  }

  createSpanAnnotation(variable: string, code: Code, from: number, to: number, tokens: Token[]) {
    const annotation: Annotation = {
      id: cuid(),
      created: new Date().toISOString(),
      type: "span",
      status: "pending",
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
      status: "pending",
      variable: variable,
      code: code.code,
      value: code.value,
      color: code.color,
      fromId: from.id,
      toId: to.id,
    };
    this.addAnnotation(annotation);
  }
}

export function createAnnotationLibrary(
  jobServer: JobServer,
  unit: Unit,
  codebook: ExtendedCodebook,
  annotations: Annotation[],
  focusVariableIndex?: number,
): AnnotationLibrary {
  const variableMap = createVariableMap(codebook.variables || []);

  let annotationArray = annotations || [];
  annotationArray = annotationArray.map((a) => ({ ...a }));

  annotationArray = repairAnnotations(annotationArray, variableMap);

  // HERE apply layout to unit (extended unit)

  // annotationArray = addTokenIndices(annotationArray, unit.content.tokens || []);

  const annotationDict: AnnotationDictionary = {};

  for (let a of annotationArray) {
    annotationDict[a.id] = a;
  }

  // ATTENTION: this needs to be moved to after the layout has been applied
  // for (let a of Object.values(annotationDict) || []) {
  //   a.positions = getTokenPositions(annotationDict, a);
  // }

  const { variableStatuses, variableIndex } = computeVariableStatuses(codebook.variables, annotationArray);

  return {
    sessionId: "maybe we can drop this?", // jobServer.sessionId
    type: unit.type,
    status: unit.status,
    annotations: annotationDict,
    byToken: newTokenDictionary(annotationDict),
    codeHistory: initializeCodeHistory(annotationArray),
    variables: codebook.variables,
    variableIndex: focusVariableIndex ?? variableIndex,
    variableStatuses,
    previousIndex: 0,
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

function computeVariableStatuses(variables: ExtendedVariable[], annotations: Annotation[]) {
  const variableStatuses: VariableStatus[] = Array(variables.length).fill("pending");

  for (let i = 0; i < variables.length; i++) {
    const variable = variables[i];

    const varName = topVarName(variable.name);
    for (let a of annotations) {
      if (topVarName(a.variable) !== varName) continue;
      variableStatuses[i] = a.status;
      break;
    }
  }

  let variableIndex = 0;
  for (let i = 1; i < variables.length; i++) {
    const prev = variableStatuses[i - 1];
    const current = variableStatuses[i];
    if ((prev === "done" || prev === "skip") && current === "pending") variableIndex = i;
    break;
  }

  return { variableStatuses, variableIndex };
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
    const varName = topVarName(a.variable);
    if (variableMap && variableMap[varName]) {
      const codeMap = variableMap[varName].codeMap;
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

function topVarName(variable: string) {
  return variable.split(".")[0];
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
    code: "EMPTY",
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
