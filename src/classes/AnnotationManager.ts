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
  TokenAnnotations,
  ValidRelation,
  VariableMap,
  VariableValueMap,
  Unit,
  AnnotationContext,
  SpanAnnotation,
  RelationAnnotation,
  QuestionAnnotation,
  SubmitAnnotation,
  PostAnnotation,
  CodebookState,
  ProgressState,
} from "@/app/types";
import { PhaseState } from "@/components/AnnotatorProvider/AnnotatorProvider";
import { prepareCodebookState } from "@/functions/codebookPhases";
import { computeProgress } from "@/functions/computeProgress";
import { getColor } from "@/functions/tokenDesign";
import { prepareCodebook } from "@/functions/treeFunctions";
import cuid from "cuid";
import randomColor from "randomcolor";
import { toast } from "sonner";
import { z } from "zod";

export async function createAnnotationManager(jobServer: JobServer, setUnitBundle: SetState<PhaseState | null>) {
  const { sessionToken, codebook, phaseProgress: unitProgress, globalAnnotations } = await jobServer.getSession();

  const codebookState = prepareCodebookState(prepareCodebook(codebook), globalAnnotations);
  const progress = await computeProgress(codebookState, globalAnnotations, unitProgress);

  const annotationManager = new AnnotationManager({
    jobServer,
    setUnitBundle,
    sessionToken,
    codebook: codebookState,
    progress,
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
  codebook: CodebookState;
  progress: ProgressState;
  globalAnnotations: Annotation[];
  sessionToken: string;
  postAnnotationsQueue: PostAnnotation["phaseAnnotations"];

  constructor({
    jobServer,
    setUnitBundle,
    sessionToken,
    codebook,
    progress,
    globalAnnotations,
  }: {
    jobServer: JobServer;
    setUnitBundle: SetState<PhaseState | null>;
    sessionToken: string;
    codebook: CodebookState;
    progress: ProgressState;
    globalAnnotations: Annotation[];
  }) {
    this.jobServer = jobServer;
    this.setUnitBundle = setUnitBundle;
    this.codebook = codebook;
    this.progress = progress;
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

    if (phaseIndex < 0 || phaseIndex > this.progress.phases.length - 1) {
      // This marks that we are done with the job
      alert("Implement finished logic");
      return;
    }

    const codebookPhase = this.codebook.phases[phaseIndex];

    const unit = await this.getUnit(phaseIndex, unitIndex);

    this.annotationLib = createAnnotationLibrary(unit, codebookPhase, this.globalAnnotations, variableIndex);

    // TODO: On navigate, perform a check of all branching rules.
    // performBranchingRules() //uses this.annotationLib

    this.setUnitBundle({
      unit,
      codebook: this.codebook,
      annotationLib: this.annotationLib,
      progress: this.progress,
      error: undefined,
    });
  }

  async getUnit(phaseIndex: number, unitIndex?: number): Promise<Unit | null> {
    if (this.codebook.phases[phaseIndex].type !== "annotation") return null;

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
    // TODO: Here (or somehwere like this) we should add the branching effects. Since we'll use the skip
    // annotation to mark when a variable is not in the path, we want to make sure that the answers that
    // cause the skip and the skip updates are in sync

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

    const phase = this.progress.phases[this.progress.currentPhase];
    const phaseFinished = phase.variables.some((s, i) => !s.skip && i > phase.currentVariable);

    if (phaseFinished) {
      this.finishPhase();
    } else {
      phase.previousVariable = phase.currentVariable;
      phase.currentVariable = phase.currentVariable + 1;
      phase.variables[phase.currentVariable].done = true;
      this.progress.phases[this.progress.currentPhase] = phase;
      this.updateProgress(this.progress);
    }
  }

  finishPhase() {
    if (this.jobServer.previewMode) {
      return toast.success("Jeej");
    }

    const progress = this.progress;
    const phase = progress.phases[progress.currentPhase];

    if (phase.currentUnit + 1 >= phase.unitsDone.length) {
      this.navigate(progress.currentPhase + 1);
    } else {
      this.navigate(progress.currentPhase, phase.currentUnit + 1);
    }
  }

  setVariableIndex(index: number) {
    const phase = this.progress.phases[this.progress.currentPhase];
    phase.previousVariable = phase.currentVariable;
    phase.currentVariable = index;
    this.progress.phases[this.progress.currentPhase] = phase;

    this.updateProgress(this.progress);
  }

  addAnnotations(annotations: Annotation[]) {
    // Gentle reminder that all annotations MUST go via this function, because this update
    // both the local annotation library state and the postAnnotationsQueue
    let current = { ...this.annotationLib.annotations };

    const phaseToken = this.annotationLib.phaseToken;
    for (let annotation of annotations) {
      current[annotation.id] = annotation;
      this.postAnnotationsQueue[phaseToken].push(annotation);
    }

    this.updateAnnotationLibrary({
      ...this.annotationLib,
      annotations: current,
      codeHistory: {},
      byToken: newTokenDictionary(current),
    });
  }

  rmAnnotations(ids: AnnotationID[], keep_empty: boolean = false) {
    let current = { ...this.annotationLib.annotations };

    const addAnnotations: Annotation[] = [];

    for (let id of ids) {
      if (!current?.[id]) continue;
      addAnnotations.push({ ...current[id], deleted: new Date() });
      delete current[id];
    }

    addAnnotations.push(...rmBrokenRelations(current));
    this.addAnnotations(addAnnotations);
  }

  submitVariable(variableId: number, context: AnnotationContext, finishLoop: boolean = true) {
    let annotation: SubmitAnnotation = {
      id: cuid(),
      created: new Date(),
      type: "submit",
      variableId: variableId,
      finishVariable: true,
      finishLoop,
      context,
      client: {},
    };

    const currentAnnotations = Object.values(this.annotationLib.annotations);
    const add: Annotation[] = [annotation];
    for (const a of currentAnnotations) {
      if (a.deleted) continue;
      if (a.variableId !== annotation.variableId) continue;
      if (a.type !== "submit") continue;
      if (!contextIsIdential(a.context, annotation.context)) continue;

      add.push({ ...a, deleted: new Date() });
    }

    this.addAnnotations(add);
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
      finishVariable: !multiple,
      finishLoop: finishLoop,
      code: code.code,
      value: code.value,
      client: { color: code.color },
      context,
    };

    let addAnnotation = true;
    const add: Annotation[] = [];

    const currentAnnotations = Object.values(this.annotationLib.annotations);
    for (const a of currentAnnotations) {
      if (a.deleted) continue;
      if (a.variableId !== annotation.variableId) continue;
      if (a.type !== "question") continue;
      if (!contextIsIdential(a.context, annotation.context)) continue;

      if (a.code === annotation.code) {
        addAnnotation = false;
        if (multiple) add.push({ ...a, deleted: new Date() });
      } else {
        if (!multiple) add.push({ ...a, deleted: new Date() });
      }
    }

    if (addAnnotation) add.push(annotation);
    this.addAnnotations(add);
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
      finishVariable: false,
      finishLoop,
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
    this.addAnnotations([annotation]);
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
      finishVariable: false,
      finishLoop,
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
    this.addAnnotations([annotation]);
  }
}

export function createAnnotationLibrary(
  unit: Unit | null,
  codebook: CodebookPhase,
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

  return {
    sessionId: cuid(),
    phaseToken: unit?.token || "global",
    annotations: annotationDict,
    byToken: newTokenDictionary(annotationDict),
    codeHistory: {},
    // previousIndex: 0,
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

    if (!a.client.color) {
      if (!a.client.color) a.client.color = randomColor({ seed: a.code, luminosity: "light" });
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

function emptyAnnotationLib() {
  return {
    sessionId: "",

    phaseToken: "",
    annotations: {},
    byToken: {},
    codeHistory: {},
    variables: [],
    variableIndex: 0,
    variableStatuses: [],
    previousIndex: 0,
  };
}
