import {
  Annotation,
  AnnotationDictionary,
  AnnotationID,
  AnnotationLibrary,
  Code,
  JobServer,
  SetState,
  Span,
  Token,
  Unit,
  AnnotationContext,
  SpanAnnotation,
  RelationAnnotation,
  QuestionAnnotation,
  PostAnnotation,
  JobManagerState,
  ProgressState,
  VariableAnnotationsMap,
  SandboxContext,
} from "@/app/types";
import { initializeJobManagerState } from "@/functions/jobManagerState/jobManagerState";
import { prepareCodebook } from "@/functions/treeFunctions";
import cuid from "cuid";
import { toast } from "sonner";
import {
  createAnnotationLibrary,
  newTokenDictionary,
  variableAnnotations,
} from "@/functions/jobManagerState/computeAnnotationLibrary";

export async function createJobManager(
  jobServer: JobServer,
  setJobManagerState: SetState<JobManagerState | null>,
  sandbox: SandboxContext,
) {
  const { sessionToken, codebook, phaseProgress, globalAnnotations } = await jobServer.getSession();

  const jobManager = new JobManager({
    jobServer,
    setJobManagerState,
    sessionToken,
    globalAnnotations,
    state: await initializeJobManagerState(codebook, globalAnnotations, phaseProgress, sandbox),
  });

  return jobManager;
}

export default class JobManager {
  jobServer: JobServer;
  setJobManagerState: SetState<JobManagerState | null>;
  lastServerUpdate: Date | null;
  state: JobManagerState;
  globalAnnotations: VariableAnnotationsMap;
  sessionToken: string;
  postAnnotationsQueue: PostAnnotation["phaseAnnotations"];

  constructor({
    jobServer,
    setJobManagerState,
    sessionToken,
    state,
    globalAnnotations,
  }: {
    jobServer: JobServer;
    setJobManagerState: SetState<JobManagerState | null>;
    sessionToken: string;
    state: JobManagerState;
    globalAnnotations: VariableAnnotationsMap;
  }) {
    this.jobServer = jobServer;
    this.setJobManagerState = setJobManagerState;
    this.state = state;
    this.globalAnnotations = globalAnnotations;
    this.lastServerUpdate = null;
    this.sessionToken = sessionToken;

    // TODO: add permanence: const postAnnotationsQueue = JSON.parse(localStorage.getItem("postAnnotationsQueue") || "");
    this.postAnnotationsQueue = {};
  }

  async navigate(phaseIndex?: number, unitIndex?: number, variableIndex?: number) {
    if (phaseIndex === undefined) phaseIndex = this.state.progress.phases.findIndex((phase) => !phase.done);

    if (
      phaseIndex === this.state.progress.current.phase &&
      unitIndex === this.state.progress.current.unit &&
      variableIndex !== undefined
    ) {
      // if only the variable index is changed, we don't need to change phase/unit, and can use the faster setVariableIndex
      this.setVariableIndex(variableIndex);
      return;
    }

    if (phaseIndex < 0 || phaseIndex > this.state.progress.phases.length - 1) {
      // This marks that we are done with the job
      alert("Implement finished logic");
      return;
    }

    this.state.unit = await this.getUnit(phaseIndex, unitIndex);

    this.state.annotationLib = createAnnotationLibrary(
      this.state.unit,
      this.state.variableMap,
      this.globalAnnotations,
      variableIndex,
    );

    // TODO: On navigate, perform a check of all branching rules.
    // performBranchingRules() //uses this.annotationLib

    this.setJobManagerState({
      ...this.state,
    });
  }

  async getUnit(phaseIndex: number, unitIndex?: number): Promise<Unit | null> {
    if (this.state.progress.phases[phaseIndex].type !== "annotation") return null;

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
    this.state.annotationLib = annotationLib;

    this.setJobManagerState?.((jobManagerState) =>
      jobManagerState ? { ...jobManagerState, annotationLib: { ...annotationLib } } : null,
    );
  }

  updateProgress(progress: ProgressState) {
    this.state.progress = progress;
    this.setJobManagerState?.((jobManagerState) =>
      jobManagerState ? { ...jobManagerState, progress: { ...progress } } : null,
    );
  }

  async finishVariable() {
    // TODO: consider optimistic updating
    const success = await this.postAnnotations();
    if (!success) return;

    const current = this.state.progress.current;

    const phaseFinished = this.state.progress.phases[current.phase].variables.every((v) => v.done);

    if (phaseFinished) {
      this.finishPhase();
    } else {
      this.state.progress.phases[current.phase].variables[current.variable].done = true;
      this.state.progress.previous = { ...this.state.progress.current };
      this.state.progress.current.variable = current.variable + 1;
      this.updateProgress(this.state.progress);
    }
  }

  finishPhase() {
    if (this.jobServer.previewMode) {
      return toast.success("Jeej");
    }

    const current = this.state.progress.current;
    const nUnits = this.state.progress.phases[current.phase].unitsDone.length;

    if (current.unit + 1 >= nUnits) {
      this.navigate(current.phase + 1);
    } else {
      this.navigate(current.phase, current.unit + 1);
    }
  }

  setVariableIndex(index: number) {
    this.state.progress.previous = { ...this.state.progress.current };
    this.state.progress.current.variable = index;
    this.updateProgress(this.state.progress);
  }

  addAnnotation(annotation: Annotation) {
    // Gentle reminder that all annotations MUST go via the addAnnotation and rmAnnotation functions, because these update
    // both the local annotation library state and the postAnnotationsQueue
    let current = { ...this.state.annotationLib.annotations };

    current[annotation.id] = annotation;
    this.addAnnotationToPostQueue(annotation, current);

    this.updateAnnotationLibrary({
      ...this.state.annotationLib,
      annotations: current,
      codeHistory: {},
      byToken: newTokenDictionary(current),
    });
  }

  rmAnnotation(id: AnnotationID, keep_empty: boolean = false) {
    let current = { ...this.state.annotationLib.annotations };

    const annotation = current[id];
    if (!annotation) throw new Error("Annotation not found");

    this.rmAnnotationFromPostQueue(annotation);
    delete current[id];

    this.updateAnnotationLibrary({
      ...this.state.annotationLib,
      annotations: current,
      codeHistory: {},
      byToken: newTokenDictionary(current),
      byVariable: variableAnnotations(current),
    });
  }

  addAnnotationToPostQueue(annotation: Annotation, annotationDict: AnnotationDictionary) {
    // Add an annotation to the post queue. we first check if there already is a postQueue for the
    // current variable. If not, we create one, and fill it with all annotations for this variable.
    const phaseToken = this.state.annotationLib.phaseToken;

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
    const phaseToken = this.state.annotationLib.phaseToken;

    const annotations = this.postAnnotationsQueue?.[phaseToken]?.[annotation.variableId]?.annotations;
    if (!annotations) return;

    this.postAnnotationsQueue[phaseToken][annotation.variableId].annotations = annotations.filter(
      (a) => a.id !== annotation.id,
    );
  }

  async submitVariable(variableId: number, context: AnnotationContext, finishLoop: boolean = true) {
    if (!this.postAnnotationsQueue[this.state.annotationLib.phaseToken]?.[variableId]) {
      this.postAnnotationsQueue[this.state.annotationLib.phaseToken][variableId] = { done: true };
    } else {
      this.postAnnotationsQueue[this.state.annotationLib.phaseToken][variableId].done = true;
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

    const currentAnnotations = Object.values(this.state.annotationLib.annotations);
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
    annotation.client.positions = getTokenPositions(this.state.annotationLib.annotations, annotation);
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
    annotation.client.positions = getTokenPositions(this.state.annotationLib.annotations, annotation);
    this.addAnnotation(annotation);
  }
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
    byVariable: {},
    codeHistory: {},
  };
}
