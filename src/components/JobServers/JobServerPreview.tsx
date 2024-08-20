import { LoremIpsum } from "@/app/projects/[projectId]/codebooks/[codebookId]/lorem";
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
  AnnotationLibrary,
  AnnotationDictionary,
} from "@/app/types";
import { createAnnotateUnit } from "@/functions/createAnnotateUnit";
import cuid from "cuid";
import { MiddlecatUser } from "middlecat-react";

class JobServerPreview implements JobServer {
  sessionId: string;
  progress: Progress;
  return_link: string;
  codebook: Codebook;
  codebookId: number;
  units: string[] | undefined;
  annotations: Record<string, Annotation[]>;
  projectId: number;
  user: MiddlecatUser;
  current: { unit: number; variable?: string };

  setPreviewVariable: (variable: string) => void;
  setPreviewData: SetState<{ unitData: UnitData; unit: Unit } | null>;

  constructor(
    projectId: number,
    user: MiddlecatUser,
    codebook: Codebook,
    units: string[],
    annotations: Record<string, Annotation[]> = {},
    current: { unit: number; variable?: string },
    setPreviewData: SetState<{ unitData: UnitData; unit: Unit } | null>,
  ) {
    this.sessionId = cuid();
    this.projectId = projectId;
    this.user = user;
    this.codebook = codebook ?? defaultCodebook;

    this.progress = {
      currentUnit: Math.min(current.unit, units.length - 1),
      currentVariable: current.variable ? this.codebook.variables.findIndex((v) => v.name === current.variable) : 0,
      nTotal: units.length,
      nCoded: Math.max(0, Math.min(current.unit, units.length - 1)),
      seekBackwards: true,
      seekForwards: true,
    };

    this.return_link = "/";
    this.codebookId = 0;
    this.annotations = annotations || {};
    this.current = current;
    this.units = units;
    this.setPreviewData = setPreviewData;
    this.setPreviewVariable = (variable: string) => {
      console.log("setPreviewVariable", variable);
      this.current.variable = variable;
    };
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

    const unitData = await this.getUnitFromServer(i);
    if ("error" in unitData) {
      this.updateProgress(i);
      return { unit: null, progress: this.progress, error: unitData.error };
    }

    // simulate annotation token, used to authorize postAnnotations
    const token = JSON.stringify({ user: this.user.email, unitId: unitData.id });
    annotateUnit = createAnnotateUnit({
      type: this.codebook.type,
      token,
      data: unitData.data,
      layout: this.codebook.type === "survey" ? undefined : this.codebook.unit,
      codebook_id: this.codebookId,
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
    if (!this.units || this.units.length === 0) return defaultUnits[Math.min(i, defaultUnits.length - 1)];
    const unitId = this.units[i];
    try {
      const unit = await this.user.api.get(`/projects/${this.projectId}/units/${encodeURIComponent(unitId)}`);
      return unit.data as UnitData;
    } catch (e) {
      return {
        error: `Unit "${unitId}" not found`,
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

const defaultCodebook: Codebook = {
  type: "annotation",
  unit: {
    fields: [
      { name: "title", type: "text", column: "title", style: { fontSize: "1.2rem", fontWeight: "bold" } },
      { name: "text", type: "text", column: "text" },
    ],
    meta: [],
  },
  settings: {},
  variables: [
    {
      type: "select code",
      name: "age",
      question: "Question goes here",
      codes: [{ code: "continue" }],
      multiple: false,
      vertical: false,
    },
  ],
};

const defaultUnits: UnitData[] = Array.from({ length: 3 }).map((_, i) => {
  return {
    id: `id-${i}`,
    data: {
      title: `${LoremIpsum.split("\n\n")[0]} ${i + 1}`,
      text: LoremIpsum.split("\n\n").slice(1).join("\n\n"),
    },
  };
});

const defaultLayout: Layout = {
  fields: [
    { name: "title", type: "text", column: "title", style: { fontSize: "1.2rem", fontWeight: "bold" } },
    { name: "text", type: "text", column: "text" },
  ],
};

export default JobServerPreview;
