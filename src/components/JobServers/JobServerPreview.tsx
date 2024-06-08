import {
  Annotation,
  Codebook,
  Status,
  Progress,
  JobServer,
  DemoData,
  RawUnit,
  ConditionReport,
  Layout,
} from "@/app/types";
import { importCodebook } from "@/functions/codebook";
import checkConditions from "@/functions/checkConditions";
import { z } from "zod";
import { LoremIpsum } from "@/app/projects/[projectId]/codebooks/[codebookId]/lorem";
import { UnitDataRowSchema } from "@/app/api/projects/[projectId]/units/schemas";
import { MiddlecatUser } from "middlecat-react";

class JobServerPreview implements JobServer {
  progress: Progress;
  return_link: string;
  codebook: Codebook;
  codebookId: string;
  annotations: Record<string, Annotation[]>;
  unitIds: string[] | undefined;
  projectId: number;
  user: MiddlecatUser;

  constructor(
    projectId: number,
    user: MiddlecatUser,
    codebook?: Codebook,
    layout?: Layout,
    unitIds?: string[],
    annotations: Record<string, Annotation[]> = {},
  ) {
    this.projectId = projectId;
    this.user = user;
    this.codebook = dummyCodebook;
    this.progress = {
      n_total: unitIds?.length || dummyUnits.length,
      n_coded: 0,
      seek_backwards: true,
      seek_forwards: false,
    };
    this.return_link = "/";
    if (codebook) this.codebook = codebook;
    this.codebookId = "demo_codebook";
    this.annotations = annotations || {};
    this.unitIds = unitIds;
  }

  async init() {}

  async getUnit(i?: number) {
    if (i && (i < 0 || i > this.progress.n_total)) return null;
    if (!this.unitIds) return dummyUnits[i || this.progress.n_coded] || null;

    const unitId = this.unitIds[i || this.progress.n_coded];
    const unit = await this.user.api.get(`/projects/${this.projectId}/units/get`, { params: { id: unitId } });
    return null;
  }

  async postAnnotations(unit_id: string, annotation: Annotation[], status: Status) {
    try {
      // if (!this.demodata.units) throw new Error("No units found");
      this.annotations[unit_id] = annotation;
      // let unit_index = Number(unit_id); // in demo job, we use the index as id
      //   this.demodata.units[unit_index].annotation = annotation;
      //   this.demodata.units[unit_index].status = this.demodata.units[unit_index].status === "DONE" ? "DONE" : status;
      //   this.progress.n_coded = Math.max(unit_index + 1, this.progress.n_coded);
      return status;
    } catch (e) {
      console.error(e);
      return "IN_PROGRESS";
    }
  }

  async getCodebook(id: string) {
    return this.codebook;
  }

  async getDebriefing() {
    return {
      message: "This is the end of the demo job!",
      link: "/demo",
      link_text: "return to overview",
    };
  }
}

const dummyCodebook: Codebook = {
  settings: {},
  variables: [
    {
      type: "select code",
      name: "age",
      question: "Codebook goes here",
      codes: [{ code: "continue" }],
      multiple: false,
      vertical: false,
    },
  ],
};

const dummyUnits: RawUnit[] = Array.from({ length: 10 }).map((_, i) => {
  return {
    index: i,
    status: "IN_PROGRESS",
    id: "id",
    type: "code",
    unit: {
      codebookId: "demo_codebook",
      annotations: [],
      text_fields: [
        {
          name: "title",
          value: `${LoremIpsum.split("\n\n")[0]} ${i + 1}`,
          style: { fontSize: "1.2rem", fontWeight: "bold" },
        },
        {
          name: "lorem",
          value: LoremIpsum.split("\n\n").slice(1).join("\n\n"),
        },
      ],
    },
  };
});

export default JobServerPreview;
