import {
  AnnotationDictionary,
  BlockType,
  Codebook,
  GetCodebook,
  JobState,
  GetUnit,
  JobBlocksResponse,
  JobServer,
  Layout,
  Progress,
  SetState,
  Status,
  UnitDataResponse,
  CodebookVariable,
} from "@/app/types";
import { MiddlecatUser } from "middlecat-react";

interface MockServer {
  // This way we can have some persistance when updating the job
  // in design mode
  progress: Progress;
  jobState: JobState;
  unitCache: Record<number | string, Omit<GetUnit, "progress">>;
}

interface JobServerDesignConstructor {
  projectId: number;
  jobId: number;

  user: MiddlecatUser;
  mockServer: MockServer;
  jobBlocks: JobBlocksResponse[];
  useRealUnits?: boolean;

  previewMode?: boolean;
}

class JobServerDesign implements JobServer {
  jobId: number;
  userId: string;
  setJobState: ((jobState: JobState) => void) | null;
  initialized: boolean;

  // The following properties are only for the Design implementation
  projectId: number;
  user: MiddlecatUser;
  mockServer: MockServer;
  jobBlocks: JobBlocksResponse[];
  useRealUnits: boolean;
  previewMode: boolean;

  unitCache: Record<number | string, Omit<GetUnit, "progress">>;
  codebookCache: Record<string, GetCodebook>;

  constructor({
    jobId,
    user,
    projectId,
    mockServer,
    jobBlocks,
    useRealUnits,
    previewMode,
  }: JobServerDesignConstructor) {
    this.jobId = jobId;
    this.userId = user.email;
    this.setJobState = null;
    this.initialized = false;

    this.projectId = projectId;
    this.user = user;
    this.mockServer = mockServer;
    this.jobBlocks = jobBlocks;

    this.previewMode = !!previewMode;

    this.useRealUnits = !!useRealUnits;

    this.unitCache = mockServer.unitCache;
    this.codebookCache = {};
  }

  async init(setJobState: SetState<JobState>) {
    // we await this to get initial jobState and progress from the server
    // In the design version we use a mockServer
    const jobState = this.mockServer.jobState;
    this.setJobState = (jobState) => {
      this.mockServer.jobState = jobState;
      setJobState(jobState);
    };
    this.setJobState(jobState);

    // add endpoitns for n units
    const nTotal = this.useRealUnits ? 0 : 5;

    const phases: Progress["phases"] = this.jobBlocks
      .filter((b) => b.parentId === null)
      .map((phase) => {
        const label = phase.name.replaceAll("_", " "); // TODO: Add label that can overwrite the default
        if (phase.type.includes("survey")) {
          return {
            type: "survey",
            label,
          };
        } else {
          return {
            type: "annotation",
            label,
            nCoded: 0,
            nTotal,
            currentUnit: 0,
          };
        }
      });

    this.mockServer.progress = { ...this.mockServer.progress, phase: 0, phasesCoded: 0, phases };
    this.initialized = true;
  }

  async getUnit(phaseNumber?: number, unitIndex?: number): Promise<GetUnit | null> {
    if (phaseNumber === undefined) phaseNumber = this.mockServer.progress.phase;
    const phase = this.mockServer.progress.phases[phaseNumber];

    // if DONE
    if (phase === undefined) return null;

    if (phase.type === "survey") {
      if (!this.unitCache["survey"]) {
        const token = JSON.stringify({ key: "survey" });
        this.updateUnitCache("survey", { token, annotations: [], status: "IN_PROGRESS" });
      }

      this.updateProgress(phaseNumber);
      this.updateJobState("survey");
      return { ...this.unitCache["survey"], progress: { ...this.mockServer.progress } };
    } else {
      // phase == annotate
      unitIndex = unitIndex === undefined || unitIndex > phase.nCoded + 1 ? phase.currentUnit : unitIndex;
      if (!this.unitCache[unitIndex]) {
        const unit: UnitDataResponse = this.useRealUnits
          ? await this.user.api.get(`/projects/${this.projectId}/jobs/${this.jobId}/units/${unitIndex}`)
          : fakeUnit(unitIndex);
        const data = unit.data;

        const token = JSON.stringify({ key: unitIndex });
        this.updateUnitCache(unitIndex, { token, data, annotations: [], status: "IN_PROGRESS" });
      }

      this.updateProgress(phaseNumber, unitIndex);
      this.updateJobState(unitIndex);
      return { ...this.unitCache[unitIndex], progress: { ...this.mockServer.progress } };
    }
  }

  async getCodebook(phaseNumber: number): Promise<GetCodebook> {
    // on server, we can use the positions of the roots to get this per phase
    // In creating progress, we include max position for roots
    if (phaseNumber > this.mockServer.progress.phases.length) throw new Error("Phase number higher than nr of phases");

    if (!this.codebookCache[phaseNumber]) {
      this.codebookCache[phaseNumber] = preparePhaseCodebooks(phaseNumber, this.jobBlocks);
    }
    return this.codebookCache[phaseNumber];
  }

  async postAnnotations(token: string, add: AnnotationDictionary, rmIds: string[], status: Status): Promise<Status> {
    const ptoken = JSON.parse(token);
    const key: number | "survey" = ptoken.key;
    const unit = this.unitCache[key];
    unit.annotations = unit.annotations.filter((a) => !rmIds.includes(a.id));
    unit.annotations = [...unit.annotations, ...Object.values(add)];
    unit.status = status;

    this.updateUnitCache(key, unit);
    this.updateJobState(key);
    return status;
  }

  updateProgress(phaseNumber: number, unitIndex?: number) {
    this.mockServer.progress.phase = phaseNumber;
    this.mockServer.progress.phasesCoded = Math.max(this.mockServer.progress.phase, phaseNumber);

    if (unitIndex !== undefined) {
      const phase = this.mockServer.progress.phases[phaseNumber];
      if (phase.type === "annotation") {
        phase.nCoded = Math.max(phase.nCoded, unitIndex);
        phase.currentUnit = unitIndex;
      }
    }
  }

  updateUnitCache(key: number | "survey", data: Omit<GetUnit, "progress">) {
    this.unitCache[key] = data;
  }

  updateJobState(unitIndex: number | "survey") {
    if (!this.setJobState) return;

    const unitData = this.unitCache[unitIndex]?.data || {};
    const surveyAnnotations: JobState["surveyAnnotations"] = {};
    const unitAnnotations: JobState["unitAnnotations"] = {};

    function setOrAppend<T>(current: T | T[] | undefined, value: T) {
      if (current === undefined) return value;
      if (Array.isArray(current)) return [...current, value];
      return [value];
    }

    const survey = this.unitCache["survey"]?.annotations || [];
    const unit = unitIndex !== "survey" ? this.unitCache[unitIndex]?.annotations || [] : [];

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

    this.setJobState({ unitData, surveyAnnotations, unitAnnotations });
  }
}

function fakeUnit(i: number): UnitDataResponse {
  return {
    id: "unit" + i,
    data: { text: `This is unit ${i}` },
  };
}

function preparePhaseCodebooks(phase: number, blocks: JobBlocksResponse[]) {
  const phaseBlocks: JobBlocksResponse[] = [];
  let phaseStarted = false;
  let type: BlockType | null = null;

  for (let block of blocks) {
    if (block.parentId === null) {
      // if root block
      if (phaseStarted) break;
      if (block.position === phase) {
        phaseStarted = true;
        type = block.type;
      }
    }

    if (phaseStarted) phaseBlocks.push(block);
  }

  if (!type) throw new Error("Phase not found");

  const codebook: Codebook = { type, variables: [] };
  let layout: Layout | undefined = undefined;

  for (let block of phaseBlocks) {
    if ("layout" in block.content) layout = block.content.layout;
    if (block.type === "annotationQuestion" || block.type === "surveyQuestion") {
      codebook.variables.push({ name: block.name, layout, ...block.content });
    }
  }

  return codebook;
}

export default JobServerDesign;
