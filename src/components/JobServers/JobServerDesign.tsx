import {
  Annotation,
  AnnotationDictionary,
  Codebook,
  GetCodebook,
  GetJobState,
  GetUnit,
  JobBlockResponse,
  JobServer,
  Layout,
  Phase,
  Progress,
  SetState,
  Status,
  Unit,
  UnitData,
  Variable,
} from "@/app/types";
import db from "@/drizzle/drizzle";
import { and, eq } from "drizzle-orm";
import { jobSetUnits } from "@/drizzle/schema";
import { MiddlecatUser } from "middlecat-react";
import { createAnnotateUnit } from "@/functions/createAnnotateUnit";
import { sortNestedBlocks } from "@/functions/treeFunctions";

interface MockServer {
  progress: Progress;
  setProgress: SetState<Progress>;
  unitCache: Record<string, Omit<GetUnit, "progress">>;
  setUnitCache: SetState<Record<string, Omit<GetUnit, "progress">>>;
}

interface JobServerDesignInit {
  projectId: number;
  jobId: number;
  initialJobState: GetJobState;
  setJobState: SetState<GetJobState | null>;

  user: MiddlecatUser;
  mockServer: MockServer;
  jobBlocks: JobBlockResponse[];
  unitLayout: Layout;
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
  jobBlocks: JobBlockResponse[];
  unitLayout: Layout;

  unitCache: Record<string, Omit<GetUnit, "progress">>;
  codebookCache: Record<string, GetCodebook>;

  constructor({
    jobId,
    initialJobState,
    setJobState,
    user,
    projectId,
    mockServer,
    jobBlocks,
    unitLayout,
  }: JobServerDesignInit) {
    this.jobId = jobId;
    this.userId = user.email;
    this.jobState = initialJobState;
    this.setJobState = setJobState;

    this.progress = mockServer.progress;

    this.projectId = projectId;
    this.user = user;
    this.mockServer = mockServer;
    this.jobBlocks = jobBlocks;
    this.unitLayout = unitLayout;

    this.unitCache = mockServer.unitCache;
    this.codebookCache = {};
  }

  async getUnit(phase: Phase, i?: number): Promise<GetUnit> {
    if (i === undefined) i = this.progress.nCoded;

    const isSurvey = phase === "preSurvey" || phase === "postSurvey";
    const key = isSurvey ? "survey" : String(i);

    if (!this.unitCache[key]) {
      let data = {};

      if (phase === "annotate") {
        const jobHasUnits = this.progress.nTotal > 0;
        const unit: UnitData = jobHasUnits
          ? await this.user.api.get(`/projects/${this.projectId}/jobs/${this.jobId}/units/${i}`)
          : fakeUnit(i);
        const data = unit.data;
      }

      const annotations: Annotation[] = [];
      const token = JSON.stringify({ key }); // on real server this must be encrypted

      this.updateUnitCache(key, { token, data, annotations });
    }

    this.updateProgress(i);
    return { ...this.unitCache[i], progress: this.progress };
  }

  async getCodebook(phase: Phase): Promise<GetCodebook> {
    if (!this.codebookCache[phase]) {
      const phaseBlocks = this.jobBlocks.filter((b) => b.phase === phase);
      const sortedBlocks = sortNestedBlocks(phaseBlocks);

      const codebook: GetCodebook = {
        blocks: sortedBlocks,
      };
      if (phase === "annotate") codebook.layout = this.unitLayout;

      this.codebookCache[phase] = codebook;
    }

    return this.codebookCache[phase];
  }

  async postAnnotations(token: string, add: AnnotationDictionary, rmIds: string[], status: Status): Promise<Status> {
    const { key } = JSON.parse(token);
    const unit = this.unitCache[key];
    unit.annotations = unit.annotations.filter((a) => !rmIds.includes(a.id));
    unit.annotations = [...unit.annotations, ...Object.values(add)];

    this.updateUnitCache(key, unit);
    return status;
  }

  updateProgress(currentUnit: number) {
    this.progress = {
      ...this.progress,
      currentUnit,
      nCoded: Math.max(this.progress.nCoded, currentUnit),
    };
    this.mockServer.setProgress({ ...this.progress });
  }

  updateUnitCache(key: string, data: Omit<GetUnit, "progress">) {
    this.unitCache[key] = data;
    this.mockServer.setUnitCache({ ...this.unitCache });
  }

  updateJobState(unitIndex: number | null) {
    const surveyAnnotations: GetJobState["surveyAnnotations"] = {};
    const unitAnnotations: GetJobState["unitAnnotations"] = {};

    function setOrAppend<T>(current: T | T[] | undefined, value: T) {
      if (current === undefined) return value;
      if (Array.isArray(current)) return [...current, value];
      return [value];
    }

    const survey = this.unitCache["survey"]?.annotations || [];
    const unit = this.unitCache[String(unitIndex)]?.annotations || [];

    for (let ann of survey) {
      if (!surveyAnnotations[ann.variable]) surveyAnnotations[ann.variable] = {};
      if (ann.code) {
        surveyAnnotations[ann.variable].code = setOrAppend(surveyAnnotations[ann.variable].code, ann.code);
      }
      if (ann.value) {
        surveyAnnotations[ann.variable].value = setOrAppend(surveyAnnotations[ann.variable].value, ann.value);
      }
    }
    for (let ann of unit) {
      if (!unitAnnotations[ann.variable]) unitAnnotations[ann.variable] = {};
      if (ann.code) {
        unitAnnotations[ann.variable].code = setOrAppend(unitAnnotations[ann.variable].code, ann.code);
      }
      if (ann.value) {
        unitAnnotations[ann.variable].value = setOrAppend(unitAnnotations[ann.variable].value, ann.value);
      }
    }
    this.setJobState({ ...this.jobState, surveyAnnotations, unitAnnotations });
  }
}
function fakeUnit(i: number): UnitData {
  return {
    id: "unit" + i,
    data: { text: `This is unit ${i}` },
  };
}

export default JobServerDesign;
