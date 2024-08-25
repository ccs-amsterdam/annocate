import { LoremIpsum } from "@/app/projects/[projectId]/codebooks/design/lorem";
import { CodebookPreview } from "@/app/projects/[projectId]/codebooks/design/page";
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
} from "@/app/types";
import { createAnnotateUnit } from "@/functions/createAnnotateUnit";
import cuid from "cuid";
import { MiddlecatUser } from "middlecat-react";
import { n } from "next-usequerystate/dist/serializer-C_l8WgvO";
import { FaThemeisle } from "react-icons/fa";

interface JobServerPreviewConstructor {
  project: Project;
  user: MiddlecatUser;
  codebookPreview: CodebookPreview;
  job?: Job;
  blockId?: number;
  setBlockId: (blockId: number) => void;
  setCodebookId: (codebookId: number) => void;
  annotations?: Record<string, Annotation[]>;
  current: { unit: number; variable?: string };
  setPreviewData: SetState<{ unitData: UnitData; unit: Unit } | null>;
}

class JobServerPreview implements JobServer {
  sessionId: string;
  progress: Progress;
  return_link: string;
  codebookId: number;
  codebook: Codebook;
  job: Job | null;
  blockId: number | null;
  annotations: Record<string, Annotation[]>;
  project: Project;
  user: MiddlecatUser;
  selectUnitArray: SelectUnitArray[];
  current: { unit: number; variable?: string };
  unitCache: Record<string, UnitData> = {};
  currentVariable: number;
  blockIndexRange: [number, number];

  setBlockId: (blockId: number) => void;
  setCodebookId: (codebookId: number) => void;
  setPreviewVariable: (variable: string) => void;
  setPreviewData: SetState<{ unitData: UnitData; unit: Unit } | null>;

  constructor({
    project,
    user,
    codebookPreview,
    job,
    blockId,
    setBlockId,
    setCodebookId,
    annotations,
    current,
    setPreviewData,
  }: JobServerPreviewConstructor) {
    this.sessionId = cuid();
    this.project = project;
    this.user = user;

    this.codebookId = codebookPreview.id;
    this.codebook = JSON.parse(JSON.stringify(codebookPreview.codebook));

    this.selectUnitArray = BlocksToUnits(project, this.codebook, job);
    const nUnits = this.selectUnitArray.length;
    this.blockIndexRange = GetBlockIndexRange(this.selectUnitArray, job, blockId);

    if (current.unit < this.blockIndexRange[0] || current.unit > this.blockIndexRange[1])
      current.unit = this.blockIndexRange[0];

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
    this.setCodebookId = setCodebookId;
    this.setPreviewData = setPreviewData;
    this.setPreviewVariable = (variable: string) => {
      this.current.variable = variable;
    };
    this.unitCache = {};
  }

  async init() {}

  async getUnit(i?: number): Promise<GetUnit> {
    let annotateUnit: Unit | null = null;
    if (i === undefined || i < 0) i = this.progress.currentUnit;

    // if we add free navigation, need to ignore this.
    if (i > this.progress.nCoded + 1) i = this.progress.nCoded + 1;

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
        this.setCodebookId(block.codebookId);
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
    const token = JSON.stringify({ user: this.user.email, unitId: unitData.id });
    annotateUnit = createAnnotateUnit({
      type: this.codebook.type,
      token,
      data: unitData.data,
      layout: this.codebook.type === "survey" ? undefined : this.codebook.unit,
      codebookId,
      annotations: this.getAnnotation(token) || [],
    });

    this.updateProgress(i);

    this.setPreviewData({ unitData, unit: annotateUnit });
    return { unit: annotateUnit, progress: this.progress };
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
    } else {
      this.annotations[`${user}_unit_${unitId}`] = current;
    }
    this.setPreviewData((d) => {
      if (!d) return d;
      return { ...d, unit: { ...d.unit, annotations: current } };
    });
  }
  getAnnotation(token: string) {
    const { user, unitId } = JSON.parse(token);
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

type SelectUnitArray = [number, number | null];

// To simulate a job, we create the units selection locally based on the block rules
// An in the real deal, we need a single array for the job progress.
// For each index in the job progress we then get a unit (null for survey) and codebookId.
// To do this locally, we just need an array with tuples: [blockIndex, unitPosition],
// where unitPosition is the position within the block or project (null for units)
// We also use some 'rules', but not all (crowd settings don't make sense for preview)
function BlocksToUnits(project: Project, codebook: Codebook, job?: Job): SelectUnitArray[] {
  let selectUnitArray: SelectUnitArray[] = [];

  if (!job) {
    if (codebook.type === "survey") return [[0, null]];
    selectUnitArray = Array.from({ length: 7 }).map((_, i) => [0, i + 1]);
    return selectUnitArray;
  }

  job.blocks.forEach((block, i) => {
    if (block.type === "survey") {
      selectUnitArray.push([i, null]);
      return;
    }

    let nUnits = block.nUnits || project.nUnits || 1; // if block nUnits is null, it means use all units. If project nUnits is also null, return 1 to give a warning
    if (block.rules.maxUnitsPerCoder) nUnits = Math.min(nUnits, block.rules.maxUnitsPerCoder);

    let units = Array.from({ length: nUnits }).map((_, j) => ({
      position: j + 1,
      random: Math.random(),
    }));
    if (block.rules.randomizeUnits) units = units.sort((a, b) => a.random - b.random);
    const addSelectUnitArray: SelectUnitArray[] = units.map((u) => [i, u.position]);
    selectUnitArray = [...selectUnitArray, ...addSelectUnitArray];
  });

  return selectUnitArray;
}

function getCurrentBlock(job: Job | null, blockId: number | null) {
  if (!job || !blockId) return null;
  return job.blocks.find((b) => b.id === blockId);
}

function GetBlockIndexRange(selectUnitArray: SelectUnitArray[], job?: Job, blockId?: number): [number, number] {
  if (!job || !blockId) return [0, selectUnitArray.length - 1];

  const blockIndex = job.blocks.findIndex((b) => b.id === blockId);
  let startIndex = selectUnitArray.findIndex(([i]) => i === blockIndex);
  if (startIndex === -1) return [0, selectUnitArray.length - 1];
  let endIndex = selectUnitArray.findLastIndex(([i]) => i === blockIndex);
  if (endIndex === -1) endIndex = selectUnitArray.length - 1;
  return [startIndex, endIndex];
}

export default JobServerPreview;
