import { LoremIpsum } from "@/app/projects/[projectId]/codebooks/[codebookId]/lorem";
import {
  AnnotateUnit,
  Annotation,
  Codebook,
  JobServer,
  Layout,
  Progress,
  Status,
  UnitData,
  Unitset,
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
  annotations: Record<string, Annotation[]>;
  unitset: Unitset | undefined;
  projectId: number;
  user: MiddlecatUser;
  layout: Layout;

  constructor(
    projectId: number,
    user: MiddlecatUser,
    codebook?: Codebook,
    layout?: Layout,
    unitset?: Unitset,
    annotations: Record<string, Annotation[]> = {},
  ) {
    this.id = cuid();
    this.projectId = projectId;
    this.user = user;
    this.codebook = codebook ?? defaultCodebook;
    this.progress = {
      current: 0,
      n_total: unitset?.count || defaultUnits.length,
      n_coded: 0,
      seek_backwards: true,
      seek_forwards: false,
    };
    this.return_link = "/";
    this.codebookId = 0;
    this.annotations = annotations || {};
    this.unitset = unitset;
    this.layout = layout || defaultLayout;
  }

  async init() {}

  async getUnit(i?: number) {
    let annotateUnit: AnnotateUnit | null = null;
    if (i === undefined || i < 0) i = this.progress.n_coded;
    if (i > this.progress.n_coded + 1) i = this.progress.n_coded + 1;

    if (i >= this.progress.n_total) {
      this.progress.current = this.progress.n_total + 1;
      this.progress.n_coded = this.progress.n_total;
      return { unit: null, progress: this.progress };
    }

    const unitData = defaultUnits[i];
    // const unitData: UnitData = this.unitIds
    //   ? await this.user.api.get(`/projects/${this.projectId}/units/get`, { params: { id: this.unitIds[i] } })
    //   : defaultUnits[i];

    // simulate annotation token, used to authorize postAnnotations
    const token = JSON.stringify({ user: this.user.email, unitId: unitData.id });
    annotateUnit = createAnnotateUnit({
      token,
      data: unitData.data,
      layout: this.layout,
      codebook_id: this.codebookId,
      annotations: this.annotations[unitData.id] || [],
    });

    this.progress.current = i;
    this.progress.n_coded = Math.max(Math.min(i, this.progress.n_total), this.progress.n_coded);
    return { unit: annotateUnit, progress: this.progress };
  }

  async postAnnotations(token: string, annotation: Annotation[], status: Status) {
    try {
      const { user, unitId } = JSON.parse(token);
      this.annotations[`${user}_${unitId}`] = annotation;
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
    if (!this.unitset) return defaultUnits[i];

    const unitset = this.unitset.name;
  }
}

function getUnitData(i: number, unitset: Unitset | undefined): UnitData {
  if (unitset) {
  }
  return defaultUnits[i];
}

const defaultCodebook: Codebook = {
  settings: {},
  variables: [
    {
      type: "select code",
      name: "age",
      question: "Codebook goes hereeeeeeeeeeeee",
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
