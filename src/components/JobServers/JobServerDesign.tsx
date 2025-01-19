import {
  Annotation,
  AnnotationDictionary,
  GetCodebook,
  GetJobState,
  GetUnit,
  JobBlock,
  JobServer,
  Progress,
  SetState,
  Status,
  Unit,
  UnitData,
} from "@/app/types";
import db from "@/drizzle/drizzle";
import { and, eq } from "drizzle-orm";
import { jobSetUnits } from "@/drizzle/schema";
import { MiddlecatUser } from "middlecat-react";
import { createAnnotateUnit } from "@/functions/createAnnotateUnit";

interface MockServer {
  progress: Progress;
  setProgress: SetState<Progress>;
  annotations: Record<number | "survey", Annotation[]>;
  setAnnotations: SetState<Record<number | "survey", Annotation[]>>;
}

interface JobServerDesignInit {
  projectId: number;
  jobId: number;
  initialProgress: Progress;
  initialJobState: GetJobState;
  setJobState: SetState<GetJobState | null>;

  user: MiddlecatUser;
  mockServer: MockServer;
  jobBlocks: JobBlock[];
}

class JobServerDesign implements JobServer {
  jobId: number;
  userId: string;
  progress: Progress;
  jobState: GetJobState;
  setJobState: SetState<GetJobState | null>;

  // The following properties are only for the Design implementation
  projectId: number;
  user: MiddlecatUser;
  mockServer: MockServer;
  jobBlocks: JobBlock[];

  unitCache: Record<number, GetUnit> = {};

  constructor({
    jobId,
    initialProgress,
    initialJobState,
    setJobState,
    user,
    projectId,
    mockServer,
    jobBlocks,
  }: JobServerDesignInit) {
    this.jobId = jobId;
    this.userId = user.email;
    this.progress = initialProgress;
    this.jobState = initialJobState;
    this.setJobState = setJobState;

    this.projectId = projectId;
    this.user = user;
    this.mockServer = mockServer;
    this.jobBlocks = jobBlocks;
  }

  async getUnit(i?: number): Promise<GetUnit> {
    if (i === undefined) i = this.progress.nCoded;

    if (this.unitCache[i]) return this.unitCache[i];

    const unit: UnitData = await this.user.api.get(`/projects/${this.projectId}/jobs/${this.jobId}/units/${i}`);
    const annotations: Annotation[] = [];
    const token =
      "normally, this is used for authorization to post annotations (e.g. contains encrypted annotationID to write to";

    const getUnit = {
      token,
      data: unit.data,
      annotations,
    };
    this.unitCache[i] = getUnit;
    return getUnit;
  }

  async getCodebook(phase: "preSurvey" | "postSurvey" | "annotate"): Promise<GetCodebook> {
    const phaseBlocks = this.jobBlocks.filter((b) => b.phase === phase);
    const roots = phaseBlocks.filter((b) => !b.parentId);
    const sortedBlocks = sortNestedBlocks(roots);

    const type = phase === "annotate" ? "annotation" : "survey";

    return {
      codebook: {
        type,
        blocks: sortedBlocks,
        settings: {},
      },
    };
  }

  async postAnnotations(token: string, add: AnnotationDictionary, rmIds: string[], status: Status) {
    let current =
      type === "survey" ? this.annotations[`${user}_survey`] || [] : this.annotations[`${user}_unit_${unitId}`] || [];
    current = current.filter((a) => !rmIds.includes(a.id));
    current = [...current, ...Object.values(add)];

    const annotations = this.mockServer.annotations[unitId] || [];
    const newAnnotations = annotations.filter((a) => !rmIds.includes(a.id)).concat(Object.values(add));
    this.mockServer.setAnnotations({ ...this.mockServer.annotations, [unitId]: newAnnotations });
  }
}

function createJobStateAnnotations(annotations: Record<number | "survey", Annotation[]>, unitId: number) {
  const surveyAnnotations: GetJobState["surveyAnnotations"] = {};
  const unitAnnotations: GetJobState["unitAnnotations"] = {};

  function setOrAppend<T>(current: T | T[] | undefined, value: T) {
    if (current === undefined) return value;
    if (Array.isArray(current)) return [...current, value];
    return [value];
  }

  if (annotations) {
    for (let ann of annotations["survey"]) {
      if (!surveyAnnotations[ann.variable]) surveyAnnotations[ann.variable] = {};
      if (ann.code) {
        surveyAnnotations[ann.variable].code = setOrAppend(surveyAnnotations[ann.variable].code, ann.code);
      }
      if (ann.value) {
        surveyAnnotations[ann.variable].value = setOrAppend(surveyAnnotations[ann.variable].value, ann.value);
      }
    }
    for (let ann of annotations[unitId]) {
      if (!unitAnnotations[ann.variable]) unitAnnotations[ann.variable] = {};
      if (ann.code) {
        unitAnnotations[ann.variable].code = setOrAppend(unitAnnotations[ann.variable].code, ann.code);
      }
      if (ann.value) {
        unitAnnotations[ann.variable].value = setOrAppend(unitAnnotations[ann.variable].value, ann.value);
      }
    }
  }
  return { surveyAnnotations, unitAnnotations };
}

function sortNestedBlocks(parents: JobBlock[]): JobBlock[] {
  let sortedBlocks: JobBlock[] = [];
  const sortedParents = parents.sort((a, b) => a.position - b.position);
  for (let parent of sortedParents) {
    sortedBlocks.push(parent);
    const children = phaseBlocks.filter((b) => b.parentId === parent.id);
    if (children.length === 0) continue;
    sortedBlocks = [...sortedBlocks, ...sortNestedBlocks(children)];
  }
  return sortedBlocks;
}
