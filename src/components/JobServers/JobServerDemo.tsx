import { Annotation, Codebook, Status, Progress, JobServer, Unit } from "@/app/types";
import cuid from "cuid";

class JobServerDemo implements JobServer {
  id: string;
  codebooks: Record<string, Codebook>; // TODO: add codebook interface
  demodata: Unit[];
  progress: Progress;
  return_link: string;
  codebookId: string;

  constructor(codebook: Codebook, units: Unit[]) {
    this.id = cuid();
    this.codebooks = { 0: codebook };
    this.demodata = units;
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
    let unit = this.demodata[i];
    // deep copy to make sure no modifications seep into the demodata.units
    unit = JSON.parse(JSON.stringify(unit));
    unit.token = JSON.stringify({ unit_index: i });
    unit.codebook_id = 0;
    return { unit: unit || null, progress: this.progress };
  }

  async postAnnotations(token: string, annotations: Annotation[], status: Status) {
    try {
      if (!this.demodata) throw new Error("No units found");

      let { unit_index } = JSON.parse(token);
      this.demodata[unit_index].annotations = annotations;
      this.demodata[unit_index].status = this.demodata[unit_index].status === "DONE" ? "DONE" : status;
      this.progress.n_coded = Math.max(unit_index + 1, this.progress.n_coded);
      return "DONE";
    } catch (e) {
      console.error(e);
      return "IN_PROGRESS";
    }
  }

  async getCodebook(id: number) {
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
