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
  CodebookPhase,
  CodebookVariable,
  JobServer,
  SetState,
  Span,
  Token,
  AnnotationsByToken,
  ValidRelation,
  VariableMap,
  Unit,
  AnnotationContext,
  SpanAnnotation,
  RelationAnnotation,
  QuestionAnnotation,
  PostAnnotation,
  CodebookState,
  ProgressState,
  VariableAnnotationsMap,
  Layouts,
} from "@/app/types";
import { PhaseState } from "@/components/AnnotatorProvider/AnnotatorProvider";
import { prepareCodebookState } from "@/functions/codebookPhases";
import { computeProgress } from "@/functions/computeProgress";
import { getColor } from "@/functions/tokenDesign";
import { prepareCodebook } from "@/functions/treeFunctions";
import cuid from "cuid";
import { toast } from "sonner";
import { z } from "zod";

export async function createAnnotationManager(jobServer: JobServer, setUnitBundle: SetState<PhaseState | null>) {
  const { sessionToken, codebook, phaseProgress: unitProgress, globalAnnotations } = await jobServer.getSession();

  const codebookState = await prepareCodebookState(prepareCodebook(codebook), globalAnnotations, unitProgress);

  const annotationManager = new AnnotationManager({
    jobServer,
    setUnitBundle,
    sessionToken,
    codebookState,
    globalAnnotations,
  });

  return annotationManager;
}

export default class AnnotationManager {
  jobServer: JobServer;
  annotationLib: AnnotationLibrary;
  setUnitBundle: SetState<PhaseState | null>;
  lastServerUpdate: Date | null;
  unit: Unit | null;
  progress: ProgressState;
  variableMap: VariableMap;
  layouts: Layouts;
  globalAnnotations: VariableAnnotationsMap;
  sessionToken: string;
  postAnnotationsQueue: PostAnnotation["phaseAnnotations"];

  constructor({
    jobServer,
    setUnitBundle,
    sessionToken,
    codebookState,
    globalAnnotations,
  }: {
    jobServer: JobServer;
    setUnitBundle: SetState<PhaseState | null>;
    sessionToken: string;
    codebookState: CodebookState;
    globalAnnotations: VariableAnnotationsMap;
  }) {
    this.jobServer = jobServer;
    this.setUnitBundle = setUnitBundle;
    this.progress = codebookState.progress;
    this.variableMap = codebookState.variableMap;
    this.layouts = codebookState.layouts;
    this.globalAnnotations = globalAnnotations;
    this.annotationLib = emptyAnnotationLib();
    this.lastServerUpdate = null;
    this.unit = null;
    this.sessionToken = sessionToken;

    // TODO: add permanence: const postAnnotationsQueue = JSON.parse(localStorage.getItem("postAnnotationsQueue") || "");
    this.postAnnotationsQueue = {};
  }

  async navigate(phaseIndex?: number, unitIndex?: number, variableIndex?: number) {
    if (phaseIndex === undefined) phaseIndex = this.progress.phases.findIndex((phase) => !phase.done);

    if (
      phaseIndex === this.progress.current.phase &&
      unitIndex === this.progress.current.unit &&
      variableIndex !== undefined
    ) {
      // if only the variable index is changed, we don't need to change phase/unit, and can use the faster setVariableIndex
      this.setVariableIndex(variableIndex);
      return;
    }

    if (phaseIndex < 0 || phaseIndex > this.progress.phases.length - 1) {
      // This marks that we are done with the job
      alert("Implement finished logic");
      return;
    }

    const unit = await this.getUnit(phaseIndex, unitIndex);

    this.annotationLib = createAnnotationLibrary(unit, this.variableMap, this.globalAnnotations, variableIndex);

    // TODO: On navigate, perform a check of all branching rules.
    // performBranchingRules() //uses this.annotationLib

    this.setUnitBundle({
      unit,
      variableMap: this.variableMap,
      annotationLib: this.annotationLib,
      progress: this.progress,
      layouts: this.layouts,
      error: undefined,
    });
  }

  async getUnit(phaseIndex: number, unitIndex?: number): Promise<Unit | null> {
    if (this.progress.phases[phaseIndex].type !== "annotation") return null;

    const getUnit = await this.jobServer.getUnit(phaseIndex, unitIndex);
    if (!getUnit) throw new Error("No unit found");

    return getUnit.unit;
  }

  async postAnnotations(): Promise<boolean> {
    try {
      if (Object.keys(this.postAnnotationsQueue).length === 0) {
        console.log("No annotations on queue");
        return true;
      }
      const res = await this.jobServer.postAnnotations({
        sessionToken: this.sessionToken,
        phaseAnnotations: this.postAnnotationsQueue,
      });
      if (res.sessionToken) this.sessionToken = res.sessionToken;
      this.postAnnotationsQueue = {};
      return true;
    } catch (e) {
      console.error("Error posting annotations", e);
      toast.error("Error posting annotations");
      return false;
    }
  }

  updateAnnotationLibrary(annotationLib: AnnotationLibrary) {
    this.annotationLib = annotationLib;

    this.setUnitBundle?.((unitBundle) => (unitBundle ? { ...unitBundle, annotationLib: { ...annotationLib } } : null));
  }

  updateProgress(progress: ProgressState) {
    this.progress = progress;
    this.setUnitBundle?.((unitBundle) => (unitBundle ? { ...unitBundle, progress: { ...progress } } : null));
  }

  async finishVariable() {
    // TODO: consider optimistic updating
    const success = await this.postAnnotations();
    if (!success) return;

    const current = this.progress.current;

    const phaseFinished = this.progress.phases[current.phase].variables.every((v) => v.done);

    if (phaseFinished) {
      this.finishPhase();
    } else {
      this.progress.phases[current.phase].variables[current.variable].done = true;
      this.progress.previous = { ...this.progress.current };
      this.progress.current.variable = current.variable + 1;
      this.updateProgress(this.progress);
    }
  }

  finishPhase() {
    if (this.jobServer.previewMode) {
      return toast.success("Jeej");
    }

    const current = this.progress.current;
    const nUnits = this.progress.phases[current.phase].unitsDone.length;

    if (current.unit + 1 >= nUnits) {
      this.navigate(current.phase + 1);
    } else {
      this.navigate(current.phase, current.unit + 1);
    }
  }

  setVariableIndex(index: number) {
    this.progress.previous = { ...this.progress.current };
    this.progress.current.variable = index;
    this.updateProgress(this.progress);
  }

  addAnnotation(annotation: Annotation) {
    // Gentle reminder that all annotations MUST go via the addAnnotation and rmAnnotation functions, because these update
    // both the local annotation library state and the postAnnotationsQueue
    let current = { ...this.annotationLib.annotations };

    current[annotation.id] = annotation;
    this.addAnnotationToPostQueue(annotation, current);

    this.updateAnnotationLibrary({
      ...this.annotationLib,
      annotations: current,
      codeHistory: {},
      byToken: newTokenDictionary(current),
    });
  }

  rmAnnotation(id: AnnotationID, keep_empty: boolean = false) {
    let current = { ...this.annotationLib.annotations };

    const annotation = current[id];
    if (!annotation) throw new Error("Annotation not found");

    this.rmAnnotationFromPostQueue(annotation);
    delete current[id];

    this.updateAnnotationLibrary({
      ...this.annotationLib,
      annotations: current,
      codeHistory: {},
      byToken: newTokenDictionary(current),
    });
  }

  addAnnotationToPostQueue(annotation: Annotation, annotationDict: AnnotationDictionary) {
    // Add an annotation to the post queue. we first check if there already is a postQueue for the
    // current variable. If not, we create one, and fill it with all annotations for this variable.
    const phaseToken = this.annotationLib.phaseToken;

    if (!this.postAnnotationsQueue[phaseToken]?.[annotation.variableId])
      this.postAnnotationsQueue[phaseToken][annotation.variableId] = {};

    const variableAnnotationsQueue = this.postAnnotationsQueue[phaseToken][annotation.variableId];
    if (!variableAnnotationsQueue.annotations) {
      variableAnnotationsQueue.annotations = Object.values(annotationDict).filter(
        (a) => a.variableId === annotation.variableId,
      );
    } else {
      variableAnnotationsQueue.annotations.push(annotation);
    }
  }

  rmAnnotationFromPostQueue(annotation: Annotation) {
    const phaseToken = this.annotationLib.phaseToken;

    const annotations = this.postAnnotationsQueue?.[phaseToken]?.[annotation.variableId]?.annotations;
    if (!annotations) return;

    this.postAnnotationsQueue[phaseToken][annotation.variableId].annotations = annotations.filter(
      (a) => a.id !== annotation.id,
    );
  }

  async submitVariable(variableId: number, context: AnnotationContext, finishLoop: boolean = true) {
    if (!this.postAnnotationsQueue[this.annotationLib.phaseToken]?.[variableId]) {
      this.postAnnotationsQueue[this.annotationLib.phaseToken][variableId] = { done: true };
    } else {
      this.postAnnotationsQueue[this.annotationLib.phaseToken][variableId].done = true;
    }
    return this.postAnnotations();
  }

  createQuestionAnnotation(
    variableId: number,
    code: Code,
    item: string | undefined,
    multiple: boolean = false,
    context: AnnotationContext,
    finishLoop: boolean = true,
  ) {
    let annotation: QuestionAnnotation = {
      id: cuid(),
      created: new Date(),
      type: "question",
      variableId: variableId,
      code: code.code,
      value: code.value,
      client: { color: code.color },
      context,
    };

    let addAnnotation = true;

    const currentAnnotations = Object.values(this.annotationLib.annotations);
    for (const a of currentAnnotations) {
      if (a.deleted) continue;
      if (a.variableId !== annotation.variableId) continue;
      if (a.type !== "question") continue;
      if (!contextIsIdential(a.context, annotation.context)) continue;

      if (a.code === annotation.code) {
        addAnnotation = false;
        if (multiple) this.rmAnnotation(a.id);
      } else {
        if (!multiple) this.rmAnnotation(a.id);
      }
    }

    if (addAnnotation) this.addAnnotation(annotation);
  }

  createSpanAnnotation(
    variableId: number,
    code: Code,
    from: number,
    to: number,
    tokens: Token[],
    finishLoop: boolean = true,
  ) {
    const annotation: SpanAnnotation = {
      id: cuid(),
      created: new Date(),
      type: "span",
      variableId: variableId,
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
    annotation.client.positions = getTokenPositions(this.annotationLib.annotations, annotation);
    this.addAnnotation(annotation);
  }

  createRelationAnnotation(
    variableId: number,
    code: Code,
    from: Annotation,
    to: Annotation,
    finishLoop: boolean = true,
  ) {
    if (!from.id || !to.id) throw new Error("Cannot create relation annotation without ids");
    const annotation: RelationAnnotation = {
      id: cuid(),
      created: new Date(),
      type: "relation",
      variableId: variableId,
      code: code.code,
      value: code.value,
      fromId: from.id,
      toId: to.id,
      client: {
        color: code.color,
      },
    };
    annotation.client.positions = getTokenPositions(this.annotationLib.annotations, annotation);
    this.addAnnotation(annotation);
  }
}

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
    codeHistory: {},
    // previousIndex: 0,
  };
}

function variableAnnotations(annotations: AnnotationDictionary) {
  const byVariable: Record<number, AnnotationID[]> = {};
  for (let a of Object.values(annotations)) {
    if (!byVariable[a.variableId]) byVariable[a.variableId] = [];
    byVariable[a.variableId].push(a.id);
  }
  return byVariable;
}

function newTokenDictionary(annotations: AnnotationDictionary) {
  const byToken: AnnotationsByToken = {};
  for (let annotation of Object.values(annotations)) {
    addToTokenDictionary(byToken, annotation);
  }
  return byToken;
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
    if (variableMap && variableMap[a.variableId]) {
      const codeMap = variableMap[a.variableId].codeMap;
      if (a.code != null && codeMap[a.code]) {
        a.client.color = getColor(a.code, codeMap);
      }
    }
  }

  return annotations;
}

// function addEmptySpan(annotations: AnnotationDictionary, id: AnnotationID) {
//   // check if this is the last annotation at this span. If not, don't add empty span
//   const annotation = annotations[id];
//   if (!annotation) return annotations;

//   for (let a of Object.values(annotations)) {
//     if (a.type !== "span" || annotation.type !== "span") continue;
//     if (!a.span || !annotation.span) continue;
//     if (a.id === annotation.id) continue;

//     if (
//       a.field === annotation.field &&
//       a.variableId === annotation.variableId &&
//       a.span[0] === annotation.span[0] &&
//       a.span[1] === annotation.span[1]
//     )
//       return annotations;
//   }

//   const emptyAnnotation = {
//     ...annotations[id],
//     id: cuid(),
//     code: "EMPTY",
//     color: "grey",
//   };
//   annotations[emptyAnnotation.id] = emptyAnnotation;
//   return annotations;
// }

// function rmEmptySpan(annotations: AnnotationDictionary, annotation: Annotation) {
//   // check if this has the same position as an empty span. If so, remove the empty span
//   for (let a of Object.values(annotations)) {
//     if (a.type !== "span" || annotation.type !== "span") continue;
//     if (!a.span || !annotation.span) continue;
//     if (a.code !== "EMPTY") continue;
//     if (
//       a.field === annotation.field &&
//       a.variableId === annotation.variableId &&
//       a.span[0] === annotation.span[0] &&
//       a.span[1] === annotation.span[1]
//     ) {
//       delete annotations[a.id];
//     }
//   }

//   return annotations;
// }

function createVariableMap(variables: CodebookVariable[]) {
  const vm: VariableMap = {};
  for (let variable of variables) {
    let cm = variable.codeMap;
    cm = Object.keys(cm).reduce((obj: any, key) => {
      obj[key] = cm[key];
      return obj;
    }, {});

    vm[variable.id] = { ...variable, codeMap: cm };

    if (variable.type === "relation") {
      const [validFrom, validTo] = getValidRelationCodes(variable.relations, variable.codeMap);
      vm[variable.id].validFrom = validFrom;
      vm[variable.id].validTo = validTo;
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

function contextIsIdential(context1?: AnnotationContext, context2?: AnnotationContext) {
  if (context1 === context2) return true;
  if (!context1 && !context2) return true;
  if (!context1 || !context2) return false;
  if (context1.field !== context2.field) return false;

  function identialArray<T>(arr1?: T[], arr2?: T[]) {
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

  if (!identialArray(context1.span, context2.span)) return false;

  return true;
}

function emptyAnnotationLib(): AnnotationLibrary {
  return {
    sessionId: "",
    phaseToken: "",
    annotations: {},
    byToken: {},
    codeHistory: {},
  };
}
