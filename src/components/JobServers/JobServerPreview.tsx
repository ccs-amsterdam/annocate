import { LoremIpsum } from "@/app/projects/[projectId]/codebooks/design/lorem";
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

interface JobServerPreviewConstructor {
  project: Project;
  user: MiddlecatUser;
  codebook: Codebook;
  job?: Job;
  blockId?: number;
  annotations?: Record<string, Annotation[]>;
  current: { unit: number; variable?: string };
  setPreviewData: SetState<{ unitData: UnitData; unit: Unit } | null>;
}

class JobServerPreview implements JobServer {
  sessionId: string;
  progress: Progress;
  return_link: string;
  codebook: Codebook;
  job: Job | null;
  blockId: number | null;
  annotations: Record<string, Annotation[]>;
  project: Project;
  user: MiddlecatUser;
  defaultUnits: UnitData[];
  useAllUnits?: boolean;
  current: { unit: number; variable?: string };
  unitCache: Record<string, UnitData> = {};

  setPreviewVariable: (variable: string) => void;
  setPreviewData: SetState<{ unitData: UnitData; unit: Unit } | null>;

  constructor({
    project,
    user,
    codebook,
    job,
    blockId,
    annotations,
    current,
    setPreviewData,
  }: JobServerPreviewConstructor) {
    this.sessionId = cuid();
    this.project = project;
    this.user = user;
    this.codebook = codebook;

    let nUnits = 7;
    if (job != null && blockId != null) {
      nUnits = job.blocks.find((b) => b.id === blockId)?.nUnits ?? 0;
      if (nUnits === 0) {
        nUnits = project.nUnits;
        this.useAllUnits = true;
      }
    }

    this.progress = {
      currentUnit: Math.min(current.unit, nUnits - 1),
      currentVariable: current.variable ? this.codebook.variables.findIndex((v) => v.name === current.variable) : 0,
      nTotal: nUnits,
      nCoded: Math.max(0, Math.min(current.unit, nUnits - 1)),
      seekBackwards: true,
      seekForwards: true,
    };

    this.defaultUnits = createDefaultUnits(codebook, nUnits);
    this.return_link = "/";
    this.annotations = annotations || {};
    this.current = current;
    this.job = job || null;
    this.blockId = blockId || null;
    this.setPreviewData = setPreviewData;
    this.setPreviewVariable = (variable: string) => {
      console.log("setPreviewVariable", variable);
      this.current.variable = variable;
    };
    this.unitCache = {};
  }

  async init() {}

  async getUnit(i?: number): Promise<GetUnit> {
    let annotateUnit: Unit | null = null;
    if (i === undefined || i < 0) i = this.progress.nCoded;
    if (i > this.progress.nCoded + 1) i = this.progress.nCoded + 1;

    if (i >= this.progress.nTotal) {
      this.updateProgress(i);
      return { unit: null, progress: this.progress };
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
      codebook_id: 0,
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
    return this.codebook;
  }

  async getDebriefing() {
    return {
      message: "No more units left!",
    };
  }

  async updateProgress(i: number) {
    this.progress.currentUnit = i;
    this.progress.nCoded = Math.max(Math.min(i, this.progress.nTotal), this.progress.nCoded);
    this.current.unit = i;
  }

  async getUnitFromServer(i: number): Promise<UnitData | { error: string }> {
    if (this.job === null || this.blockId === null) {
      return this.defaultUnits[Math.min(i, this.defaultUnits.length - 1)];
    }

    try {
      const params = { position: i + 1, blockId: this.useAllUnits ? undefined : this.blockId };
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
    console.log(current);
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

function createDefaultUnits(codebook: Codebook, n: number): UnitData[] {
  if (codebook.type === "survey") {
    return [
      {
        id: "survey",
        data: {},
      },
    ];
  }

  return Array.from({ length: n }).map((_, i) => {
    const data: Record<string, string> = {};
    codebook.unit.fields.forEach((field) => {
      data[field.name] = `Here goes a ${field.type} field called ${field.name}`;
    });
    return {
      id: `id-${i}`,
      data,
    };
  });
}

export default JobServerPreview;
