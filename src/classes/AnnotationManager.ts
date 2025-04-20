import { AnnotationSchema } from "@/app/api/projects/[projectId]/annotations/schemas";
import {
  Annotation,
  AnnotationDictionary,
  AnnotationID,
  AnnotationLibrary,
  AnnotationRelation,
  Code,
  CodeHistory,
  CodeMap,
  ExtendedCodebookPhase,
  ExtendedVariable,
  JobServer,
  SetState,
  Span,
  Status,
  Token,
  TokenAnnotations,
  ValidRelation,
  VariableMap,
  ProgressStatus,
  VariableValueMap,
  Unit,
  QuestionAnnotationContext,
  SpanAnnotation,
  RelationAnnotation,
  QuestionAnnotation,
  CodebookNode,
  GetJobState,
  Progress,
  JobState,
} from "@/app/types";
import { PhaseState } from "@/components/AnnotatorProvider/AnnotatorProvider";
import { getCodebookPhases } from "@/functions/codebookPhases";
import { computeVariableStatuses, topVarName } from "@/functions/computeVariableStatuses";
import { getColor } from "@/functions/tokenDesign";
import cuid from "cuid";
import randomColor from "randomcolor";
import { toast } from "sonner";
import { z } from "zod";

export default class AnnotationManager {
  jobServer: JobServer;
  annotationLib: AnnotationLibrary;
  setUnitBundle: SetState<PhaseState | null>;
  lastAnnotationIds: string[];
  unit: Unit | null;
  codebookPhases: ExtendedCodebookPhase[];
  globalAnnotations: Annotation[];
  progress: Progress;

  constructor({
    jobServer,
    setUnitBundle,
    codebook,
    progress,
    globalAnnotations,
  }: {
    jobServer: JobServer;
    setUnitBundle: SetState<PhaseState | null>;
    codebook: CodebookNode[];
    progress: Progress;
    globalAnnotations: Annotation[];
  }) {
    this.jobServer = jobServer;
    this.setUnitBundle = setUnitBundle;
    this.codebookPhases = getCodebookPhases(codebook);
    this.globalAnnotations = globalAnnotations;
    this.progress = progress;
    this.annotationLib = {
      annotations: {},
      byToken: {},
      codeHistory: {},
      variables: [],
      variableIndex: 0,
      variableStatuses: [],
      previousIndex: 0,
    };
    this.lastAnnotationIds = [];
    this.unit = null;
  }

  // async initialize({
  //   jobServer,
  //   setUnitBundle,
  // }: {
  //   jobServer: JobServer;
  //   setUnitBundle?: SetState<PhaseState | null>;
  // }) {
  //   this.setUnitBundle = setUnitBundle;

  //   const codebook = await jobServer.getCodebook();
  //   this.codebookPhases = getCodebookPhases(codebook);

  //   const { annotations, progress } = await jobServer.getJobState();
  //   this.jobState = { annotations, progress, unitData: {} };

  //   const phaseIndex = progress.phasesCoded;
  //   const currentPhase = progress.phases[phaseIndex];
  //   const unitIndex = currentPhase.type === "annotation" ? currentPhase.currentUnit : undefined;

  //   this.navigate(phaseIndex, unitIndex);
  // }

  async navigate(phaseIndex?: number, unitIndex?: number, variableIndex?: number) {
    if (phaseIndex === undefined) phaseIndex = this.progress.phases.findIndex((p) => p.status === "pending");

    if (phaseIndex < 0 || phaseIndex > this.progress.phases.length - 1) {
      // This marks that we are done with the job
      alert("Implement finished logic");
      return;
    }

    const codebookPhase = this.codebookPhases[phaseIndex];

    const unit = await this.getUnit(phaseIndex, unitIndex);

    this.annotationLib = createAnnotationLibrary(unit, codebookPhase, this.globalAnnotations, variableIndex);

    this.setUnitBundle({
      unit,
      codebook: codebookPhase,
      annotationLib: this.annotationLib,
      progress: this.progress,
      error: undefined,
    });
  }

  navigateNext() {
    const progress = this.jobState.progress;
    const phase = progress.phases[progress.phase];
  }

  async getUnit(phaseIndex: number, unitIndex?: number): Promise<Unit | null> {
    const phase = this.progress.phases[phaseIndex];
    if (phase.type !== "annotation") return null;

    const unit = await this.jobServer.getUnit(phaseIndex, unitIndex);
    if (!unit) throw new Error("No unit found");

    // update phase unit progress
    phase.nCoded = unit.nCoded;
    phase.nTotal = unit.nTotal;

    return unit;
  }

  finishPhase() {
    if (this.jobServer.previewMode) {
      return toast.success("Jeej");
    }

    const progress = this.jobState.progress;
    const phase = progress.phases[progress.phase];

    // If we are in a survey phase, we just move to the next phase
    if (phase.type === "survey") {
      this.navigate(progress.phase + 1);
      return;
    }

    // If we are in an annotation phase, we move to the next unit,
    // or the next phase if we are at the last unit
    if (phase.type === "annotation") {
      if (phase.currentUnit + 1 >= phase.nTotal) {
        this.navigate(progress.phase + 1);
      } else {
        this.navigate(progress.phase, phase.currentUnit + 1);
      }
    }
  }

  async postAnnotations(status: Status): Promise<Status> {
    try {
      const add: AnnotationDictionary = { ...this.annotationLib.annotations };
      const rmIds: string[] = [];
      for (let id of this.lastAnnotationIds) {
        if (!add[id]) rmIds.push(id);
        delete add[id];
      }

      const token = this.unit ? this.unit.token : "TODO: implement phase token?";
      const resStatus = await this.jobServer.postAnnotations(token, add, rmIds, status);
      this.lastAnnotationIds = Object.keys(this.annotationLib.annotations);
      return resStatus;
    } catch (e) {
      console.error("Error posting annotations", e);
      toast.error("Error posting annotations");
      return "IN_PROGRESS";
    }
  }

  updateAnnotationLibrary(annotationLib: AnnotationLibrary) {
    // TODO: Here (or somehwere like this) we should add the branching effects. Since we'll use the skip
    // annotation to mark when a variable is not in the path, we want to make sure that the answers that
    // cause the skip and the skip updates are in sync

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
    annotation.client.positions = getTokenPositions(this.annotationLib.annotations, annotation);

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

  createQuestionAnnotation(
    variable: string,
    code: Code,
    multiple: boolean = false,
    context: QuestionAnnotationContext,
  ) {
    let annotation: QuestionAnnotation = {
      id: cuid(),
      created: new Date().toISOString(),
      type: "question",
      status: "pending",
      variable: variable,
      code: code.code,
      value: code.value,
      client: { color: code.color },
      context,
    };

    let addAnnotation = true;

    const currentAnnotations = Object.values(this.annotationLib.annotations);
    const newAnnotations: Record<string, Annotation> = { ...this.annotationLib.annotations };
    for (const a of currentAnnotations) {
      if (a.variable !== annotation.variable) continue;
      if (a.type !== "question") continue;
      if (!contextIsIdential(a.context, annotation.context)) continue;

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
    const annotation: SpanAnnotation = {
      id: cuid(),
      created: new Date().toISOString(),
      type: "span",
      status: "pending",
      variable: variable,
      code: code.code,
      value: code.value,
      offset: tokens[from].offset,
      length: tokens[to].length + tokens[to].offset - tokens[from].offset,
      field: tokens[from].field,
      span: [from, to],
      client: {
        color: code.color,
        text: getSpanText([from, to], tokens),
      },
    };
    this.addAnnotation(annotation);
  }

  createRelationAnnotation(variable: string, code: Code, from: Annotation, to: Annotation) {
    if (!from.id || !to.id) throw new Error("Cannot create relation annotation without ids");
    const annotation: RelationAnnotation = {
      id: cuid(),
      created: new Date().toISOString(),
      type: "relation",
      variable: variable,
      code: code.code,
      value: code.value,
      fromId: from.id,
      toId: to.id,
      client: {
        color: code.color,
      },
    };
    this.addAnnotation(annotation);
  }
}

export function createAnnotationLibrary(
  unit: Unit | null,
  codebook: ExtendedCodebookPhase,
  globalAnnotations: Annotation[] | undefined,
  focusVariableIndex?: number,
): AnnotationLibrary {
  const variableMap = createVariableMap(codebook.variables || []);

  const annotations = [...(unit?.annotations || []), ...(globalAnnotations || [])];

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

  const { variableStatuses, variableIndex } = computeVariableStatuses(codebook.variables, annotationArray);

  return {
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
  if (!annotation.client.positions) return;
  annotation.client.positions.forEach((i) => {
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
  const annMap: Record<string, Annotation> = {};

  // first add the span token indices, and simultaneously create an annotation map
  for (let a of annotations || []) {
    if (a.type === "span") {
      const from = getIndexFromOffset(tokens, a.field, a.offset);
      const to = getIndexFromOffset(tokens, a.field, a.offset + a.length - 1);
      if (from !== null && to !== null) {
        a.span = [from, to];
        if (!a.client.text) a.client.text = getSpanText(a.span, tokens);
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

function initializeCodeHistory(annotations: Annotation[]): CodeHistory {
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
}

function getSpanText(span: Span, tokens: Token[]) {
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
}

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
        a.client.color = getColor(a.code, codeMap);
      }
    }

    if (!a.client.color) {
      if (!a.client.color) a.client.color = randomColor({ seed: a.code, luminosity: "light" });
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
  const vm: VariableMap = {};
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
  if (!relations) return [undefined, undefined];
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

function contextIsIdential(context1?: QuestionAnnotationContext, context2?: QuestionAnnotationContext) {
  if (context1 === context2) return true;
  if (!context1 && !context2) return true;
  if (!context1 || !context2) return false;

  function identialArray(arr1?: string[], arr2?: string[]) {
    if (!arr1 && !arr2) return true;
    if (!arr1 || !arr2) return false;
    if (arr1.length !== arr2.length) return false;
    const sortedArr1 = arr1.slice().sort();
    const sortedArr2 = arr2.slice().sort();
    for (let i = 0; i < sortedArr1.length; i++) {
      if (sortedArr1[i] !== sortedArr2[i]) return false;
    }
    return true;
  }

  if (!identialArray(context1.fields, context2.fields)) return false;
  if (!identialArray(context1.annotationIds, context2.annotationIds)) return false;

  return true;
}
