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
} from "@/app/types";
import { createAnnotateUnit } from "@/functions/createAnnotateUnit";
import cuid from "cuid";
import { MiddlecatUser } from "middlecat-react";

class JobServerPreview implements JobServer {
  id: string;
  progress: Progress;
  return_link: string;
  codebook: Codebook;
  codebookId: number;
  units: string[] | undefined;
  annotations: Record<string, Annotation[]>;
  projectId: number;
  user: MiddlecatUser;

  setPreviewData: SetState<{ unitData: UnitData; unit: Unit } | null>;

  constructor(
    projectId: number,
    user: MiddlecatUser,
    codebook: Codebook,
    units: string[],
    annotations: Record<string, Annotation[]> = {},
    setPreviewData: SetState<{ unitData: UnitData; unit: Unit } | null>,
  ) {
    this.id = cuid();
    this.projectId = projectId;
    this.user = user;
    this.codebook = codebook ?? defaultCodebook;
    this.progress = {
      current: 0,
      n_coded: 0,
      n_total: units?.length || defaultUnits.length,
      seek_backwards: true,
      seek_forwards: true,
    };
    this.return_link = "/";
    this.codebookId = 0;
    this.annotations = annotations || {};
    this.units = units;
    this.setPreviewData = setPreviewData;
  }

  async init() {}

  async getUnit(i?: number): Promise<GetUnit> {
    let annotateUnit: Unit | null = null;
    if (i === undefined || i < 0) i = this.progress.n_coded;
    if (i > this.progress.n_coded + 1) i = this.progress.n_coded + 1;

    if (i >= this.progress.n_total) {
      this.progress.current = this.progress.n_total + 1;
      this.progress.n_coded = this.progress.n_total;
      return { unit: null, progress: this.progress };
    }

    const unitData = await this.getUnitFromServer(i);
    if (unitData.error) {
      this.progress.current = i;
      this.progress.n_coded = Math.max(Math.min(i, this.progress.n_total), this.progress.n_coded);
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

    this.progress.current = i;
    this.progress.n_coded = Math.max(Math.min(i, this.progress.n_total), this.progress.n_coded);

    this.setPreviewData({ unitData, unit: annotateUnit });
    return { unit: annotateUnit, progress: this.progress };
  }

  async postAnnotations(token: string, annotation: Annotation[], status: Status) {
    try {
      this.setAnnotation(token, annotation);
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

  async getUnitFromServer(i: number) {
    if (!this.units || this.units.length === 0) return defaultUnits[i];
    const unitId = this.units[i];
    try {
      const unit = await this.user.api.get(`/projects/${this.projectId}/units/${encodeURIComponent(unitId)}`);
      return unit.data;
    } catch (e) {
      return {
        error: `Unit "${unitId}" not found`,
      };
    }
  }

  setAnnotation(token: string, annotation: Annotation[]) {
    const { user, unitId } = JSON.parse(token);
    this.annotations[`${user}_unit_${unitId}`] = annotation;
    this.setPreviewData((d) => {
      if (!d) return d;
      return { ...d, unit: { ...d.unit, annotations: annotation } };
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
