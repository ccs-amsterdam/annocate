import { LoremIpsum } from "@/app/projects/[projectId]/jobs/[jobId]/design/lorem";
import { CodebookPreview } from "@/app/projects/[projectId]/jobs/[jobId]/design/page";
import {
  Unit,
  Annotation,
  Codebook,
  JobServer,
  GetUnit,
  Layout,
  Progress,
  Status,
  UnitData,
  SetState,
  AnnotationDictionary,
  Job,
  Project,
  GetJobState,
  SurveyAnnotations,
} from "@/app/types";
import { createAnnotateUnit } from "@/functions/createAnnotateUnit";
import cuid from "cuid";
import { MiddlecatUser } from "middlecat-react";

interface JobServerPreviewConstructor {
  project: Project;
  user: MiddlecatUser;
  codebookPreview: CodebookPreview;
  job?: Job;
  blockId?: number;
  setBlockId: (blockId: number) => void;
  annotations?: Record<string, Annotation[]>;
  current: { unit: number; variable?: string };
  setPreviewData: SetState<PreviewData | null>;
}

export interface PreviewData {
  unitData: UnitData;
  unit: Unit;
  surveyAnnotations: SurveyAnnotations;
}

class JobServerPreview implements JobServer {
  sessionId: string;
  progress: Progress;
  return_link: string;
  codebookId: number;
  codebook: Codebook;
  jobId: number;
  job: Job | null;
  jobState: GetJobState | null;
  blockId: number | null;
  annotations: Record<string, Annotation[]>;
  project: Project;
  user: MiddlecatUser;
  current: { unit: number; variable?: string };
  unitCache: Record<string, UnitData> = {};
  currentVariable: number;
  blockIndexRange: [number, number];

  setBlockId: (blockId: number) => void;
  setPreviewVariable: (variable: string) => void;
  setJobState: SetState<GetJobState | null> | null;
  setPreviewData: SetState<PreviewData | null>;

  constructor({
    project,
    user,
    codebookPreview,
    job,
    blockId,
    setBlockId,
    annotations,
    current,
    setPreviewData,
  }: JobServerPreviewConstructor) {
    this.sessionId = cuid();
    this.jobId = job?.id || -1;
    this.jobState = null;
    this.setJobState = null;

    this.project = project;
    this.user = user;

    this.codebookId = codebookPreview.id;
    this.codebook = JSON.parse(JSON.stringify(codebookPreview.codebook));

    //this.selectUnitArray = BlocksToUnits(project, this.codebook, job);
    //const nUnits = this.selectUnitArray.length;
    //this.blockIndexRange = GetBlockIndexRange(this.selectUnitArray, job, blockId);

    //if (current.unit < this.blockIndexRange[0] || current.unit > this.blockIndexRange[1])
    //  current.unit = this.blockIndexRange[0];

    this.progress = {
      currentUnit: current.unit,
      nTotal: nUnits,
      nCoded: Math.max(0, Math.min(current.unit, nUnits - 1)),
      seekBackwards: true,
      seekForwards: true,
    };

    this.currentVariable = current.variable ? this.codebook.variables.findIndex((v) => v.name === current.variable) : 0;
    if (this.currentVariable === -1) this.currentVariable = 0;

    this.return_link = "/";
    this.annotations = annotations || {};
    this.current = current;
    this.job = job || null;
    this.blockId = blockId || null;
    this.setBlockId = setBlockId;
    this.setPreviewData = setPreviewData;
    this.setPreviewVariable = (variable: string) => {
      this.current.variable = variable;
    };
    this.unitCache = {};
  }

  async registerJobState(setJobState: SetState<GetJobState | null>) {
    this.jobState = prepareJobState(this.user.email, this.project, this.job || undefined, this.annotations);
    this.setJobState = setJobState;
    this.setJobState(this.jobState);
  }

  async getUnit(i?: number): Promise<GetUnit> {
    let annotateUnit: Unit | null = null;
    if (i === undefined || i < 0) i = this.progress.currentUnit;

    // if we add free navigation, need to ignore this.
    if (!this.progress.seekForwards && i > this.progress.nCoded + 1) i = this.progress.nCoded + 1;

    if (i >= this.progress.nTotal) {
      this.updateProgress(i);
      return { unit: null, progress: this.progress };
    }

    let codebookId = this.codebookId;
    if (this.job != null && this.blockId != null) {
      const block = this.job.blocks[this.selectUnitArray[i][0]];
      codebookId = block.codebookId;
      if (block.id !== this.blockId) {
        this.updateProgress(i);
        this.setBlockId(block.id);
        return { unit: null, progress: this.progress };
      }
    }

    if (!this.unitCache[i]) {
      const newUnitData = await this.getUnitFromServer(i);
      if ("error" in newUnitData) {
        this.updateProgress(i);
        return { unit: null, progress: this.progress, error: newUnitData.error };
      }
      this.unitCache[i] = newUnitData;
    }
    const unitData = this.unitCache[i];

    // simulate annotation token, used to authorize postAnnotations
    const token = JSON.stringify({ user: this.user.email, unitId: unitData.id, type: this.codebook.type });
    annotateUnit = createAnnotateUnit({
      type: this.codebook.type,
      token,
      data: unitData.data,
      layout: this.codebook.type === "survey" ? undefined : this.codebook.unit,
      blockId,
      annotations: this.getAnnotation(token) || [],
    });

    this.updateProgress(i);

    this.setPreviewData((previewData) => ({
      surveyAnnotations: previewData?.surveyAnnotations || {},
      unitData,
      unit: annotateUnit,
    }));
    return { unit: annotateUnit, progress: { ...this.progress } };
  }

  async postAnnotations(token: string, add: AnnotationDictionary, rmIds: string[], status: Status) {
    try {
      this.setAnnotation(token, add, rmIds);
      return status;
    } catch (e) {
      console.error(e);
      return "IN_PROGRESS";
    }
  }

  async getCodebook(id: number) {
    if (id !== this.codebookId) {
      const emptyCodebook: Codebook = {
        settings: {},
        type: "survey",
        variables: [],
      };
      return {
        codebook: emptyCodebook,
      };
    }
    return { codebook: this.codebook };
  }

  async getDebriefing() {
    return {
      message: "No more units left!",
    };
  }

  updateProgress(i: number) {
    this.progress.previousUnit = this.progress.currentUnit;
    this.progress.currentUnit = i;
    this.progress.nCoded = Math.max(Math.min(i, this.progress.nTotal), this.progress.nCoded);
    this.current.unit = i;
  }

  async getUnitFromServer(i: number): Promise<UnitData | { error: string }> {
    const block = getCurrentBlock(this.job, this.blockId);

    // if block is not null, this has precedence for type, because the preview codebook lags behind
    const type = block ? block.type : this.codebook.type;

    if (type === "survey" || this.job === null || this.blockId === null) {
      return createDefaultUnit(this.codebook, i);
    }

    try {
      const position = this.selectUnitArray[i][1];
      const params: { position: number | null; blockId?: number } = { position: position, blockId: this.blockId };

      // check if block has units, because if not, the blockId should not be in the params
      // (need to rethinkg this. Ideally the server checks this, but that's an additional request)
      if (block && block.nUnits === 0) delete params.blockId;

      const unit = await this.user.api.get(`/projects/${this.project.id}/units/preview`, { params });
      return unit.data as UnitData;
    } catch (e) {
      return {
        error: `Unit not found`,
      };
    }
  }

  setAnnotation(token: string, add: AnnotationDictionary, rmIds: string[]) {
    const { user, unitId, type } = JSON.parse(token);

    let current =
      type === "survey" ? this.annotations[`${user}_survey`] || [] : this.annotations[`${user}_unit_${unitId}`] || [];
    current = current.filter((a) => !rmIds.includes(a.id));
    current = [...current, ...Object.values(add)];

    if (type === "survey") {
      this.annotations[`${user}_survey`] = current;
      if (this.jobState && this.setJobState) {
        this.jobState = { ...this.jobState, surveyAnnotations: createJobStateAnnotations(this.user.email, current) };
        this.setJobState(this.jobState);
      }
    } else {
      this.annotations[`${user}_unit_${unitId}`] = current;
    }
    this.setPreviewData((d) => {
      if (!d) return d;
      return {
        ...d,
        unit: { ...d.unit, annotations: current },
        surveyAnnotations: this?.jobState?.surveyAnnotations || {},
      };
    });
  }
  getAnnotation(token: string) {
    const { user, unitId, type } = JSON.parse(token);
    if (type === "survey") return this.annotations[`${user}_survey`];
    return this.annotations[`${user}_unit_${unitId}`];
  }
}

function createDefaultUnit(codebook: Codebook, i: number): UnitData {
  if (codebook.type === "survey") {
    return {
      id: "survey",
      data: {},
    };
  }

  const data: Record<string, string> = {};
  codebook.unit.fields.forEach((field) => {
    data[field.name] = `Here goes a ${field.type} field called ${field.name}`;
  });
  return {
    id: `id-${i}`,
    data,
  };
}

// This gives deterministic results if randomizeUnits is used, which prevents
// messing up live editing of the codingjob (because the preview would change)
const randomUnits = Array.from({ length: 100000 }).map((_, i) => ({
  position: i + 1,
  random: Math.random(),
}));

type SelectUnitArray = [number, number | null];

function getCurrentBlock(job: Job | null, blockId: number | null) {
  if (!job || !blockId) return null;
  return job.blocks.find((b) => b.id === blockId);
}

function createJobStateAnnotations(annotations?: Annotation[]) {
  const surveyAnnotations: GetJobState["surveyAnnotations"] = {};

  function setOrAppend<T>(current: T | T[] | undefined, value: T) {
    if (current === undefined) return value;
    if (Array.isArray(current)) return [...current, value];
    return [value];
  }

  if (annotations) {
    for (let ann of annotations) {
      if (!surveyAnnotations[ann.variable]) surveyAnnotations[ann.variable] = {};
      if (ann.code) {
        surveyAnnotations[ann.variable].code = setOrAppend(surveyAnnotations[ann.variable].code, ann.code);
      }
      if (ann.value) {
        surveyAnnotations[ann.variable].value = setOrAppend(surveyAnnotations[ann.variable].value, ann.value);
      }
    }
  }
  return surveyAnnotations;
}

function prepareJobState(
  user: string,
  project: Project,
  job: Job | undefined,
  annotations: Record<string, Annotation[]> | undefined,
) {
  const jobState: GetJobState = { blocks: [], surveyAnnotations: {} };

  if (job) {
    for (let block of job.blocks) {
      const jobblock = {
        id: block.id,
        phase: block.phase,
        position: block.position,
      };
      jobState.blocks.push(jobblock);
    }
  }

  if (annotations) jobState.surveyAnnotations = createJobStateAnnotations(user, annotations[`${user}_survey`]);

  return jobState;
}

export default JobServerPreview;
