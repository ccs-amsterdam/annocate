import { Annotation, Codebook, Status, Progress, JobServer, DemoData, RawUnit, ConditionReport } from "@/app/types";
import { importCodebook } from "@/functions/codebook";
import checkConditions from "@/functions/checkConditions";
import cuid from "cuid";

class JobServerDemo implements JobServer {
  id: string;
  codebooks: Record<string, Codebook>; // TODO: add codebook interface
  demodata: DemoData;
  progress: Progress;
  return_link: string;
  codebookId: string;

  constructor(codebook: Codebook, units: RawUnit[]) {
    this.id = cuid();
    this.codebooks = { demo_codebook: codebook };
    this.demodata = {
      units: units.map((u, i) => {
        return {
          id: String(i),
          external_id: String(u.id),
          unit: u.unit,
          type: u.type,
          conditionals: u.conditionals,
          index: i,
          status: "PREALLOCATED",
        };
      }),
    };
    this.progress = {
      current: 0,
      n_total: units.length,
      n_coded: 0,
      seek_backwards: true,
      seek_forwards: false,
    };
    this.return_link = "/";
    this.codebookId = "demo_codebook";
  }

  async init() {}

  async getUnit(i?: number) {
    if (i === undefined) {
      i = this.progress.n_coded;
    } else {
      this.progress.n_coded = Math.max(i, this.progress.n_coded);
    }
    let unit = this.demodata?.units?.[i];
    // deep copy to make sure no modifications seep into the demodata.units
    unit = JSON.parse(JSON.stringify(unit));
    return { unit: unit || null, progress: this.progress };
  }

  async postAnnotations(unit_id: string, annotation: Annotation[], status: Status) {
    try {
      if (!this.demodata.units) throw new Error("No units found");
      let unit_index = Number(unit_id); // in demo job, we use the index as id
      this.demodata.units[unit_index].annotation = annotation;
      this.demodata.units[unit_index].status = this.demodata.units[unit_index].status === "DONE" ? "DONE" : status;
      this.progress.n_coded = Math.max(unit_index + 1, this.progress.n_coded);
      return "DONE";
    } catch (e) {
      console.error(e);
      return "IN_PROGRESS";
    }
  }

  async getCodebook(id: string) {
    return this.codebooks[id];
  }

  async getDebriefing() {
    return {
      message: "This is the end of the demo job!",
      link: "/demo",
      link_text: "return to overview",
    };
  }
}

export default JobServerDemo;
