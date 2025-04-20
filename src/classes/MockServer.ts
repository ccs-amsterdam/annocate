import { PostAnnotationUpdateSchema } from "@/app/api/annotate/[jobId]/schemas";
import { AnnotationSchema } from "@/app/api/projects/[projectId]/annotations/schemas";
import {
  AnnotationDictionary,
  CodebookPhase,
  GetUnit,
  CodebookNode,
  JobServer,
  Layout,
  Progress,
  SetState,
  Status,
  UnitDataResponse,
  Annotation,
  UnitData,
  Unit,
  GetJobState,
  ProgressStatus,
} from "@/app/types";
import { getCodebookPhases } from "@/functions/codebookPhases";
import { MiddlecatUser } from "middlecat-react";
import { z } from "zod";

interface MockServerConstructor {
  codebook: CodebookNode[];
  units?: UnitDataResponse[];
}

interface ServerUnit {
  index: number;
  id: number;
  data: UnitData;
  status: ProgressStatus;
}
type PhaseUnits = Record<number, ServerUnit[]>;

type UnitId = number | "global";
type VariableId = number;
type VariableAnnotations = {
  done: boolean;
  skip: boolean;
  annotations: AnnotationDictionary;
};
type ServerAnnotations = Record<UnitId, Record<VariableId, VariableAnnotations>>;

class MockServer {
  annotations: ServerAnnotations;
  codebook: CodebookNode[];
  phaseUnits: PhaseUnits;
  cookies: {
    session: string | null;
  };

  constructor({ codebook, units }: MockServerConstructor) {
    this.codebook = codebook;
    this.annotations = { global: {} };
    this.cookies = {
      session: null,
    };

    // this at some point needs to respect settings from the annotation phase.
    // Now it just uses all units. Also, maybe use phase ids instead of indices
    this.phaseUnits = {};
    const phases = codebook.filter((node) => node.treeType === "phase");
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      if (phase.phase === "annotation") {
        this.phaseUnits[i] = (units ?? mockUnits(10)).map((unit, index) => ({
          index: index,
          id: unit.id,
          data: unit.data,
          status: "pending",
        }));
      }
    }
  }

  async getJobState(): Promise<GetJobState> {
    // RENAME THIS TO getSession
    // rename jobstate to session
    // (jobToken then becomes sessionToken)
    // includes a token that encrypts the jobId, coderId, and progress
    //
    // !!!! at the start of the session create a random secret (keep in jobAnnotator)
    // this secret is included in the jobToken, which is added as a http-only cookie
    // All the codes in the codebook are given an encrpted token using this secret
    // for validation information:
    // - hash of the code and value
    // - gold boolean
    // The phase can also have a token that encrypts:
    // - required variables
    this.cookies.session = encryptSessionToken({
      jobId: 0,
      coderId: 0,
      secret: "secret",
    });

    return {
      annotateProgress: computeProgress(this.phaseUnits, this.codebook, this.annotations),
      globalAnnotations: this.annotations["global"] || [],
    };
  }

  async getUnitEndpoint(phaseNumber: number, unitIndex?: number): Promise<GetUnit | null> {
    const units = this.phaseUnits[phaseNumber];
    if (!units) throw new Error("Invalid phase number (client problem");
    if (units.length === 0) throw new Error("No units in phase (job problem)");

    const unit = unitIndex ? units[unitIndex] : units.find((unit) => unit.status === "pending");
    if (!unit) throw new Error("Invalid unit index (client problem)");

    const annotations: Annotation[] = [];
    const variableAnnotations = Object.values(this.annotations[unit.id] || {});
    for (let va of variableAnnotations) {
      const activeAnnotations = Object.values(va.annotations)
        .filter((a) => !a.deleted)
        .sort((a, b) => a.created.getTime() - b.created.getTime());
      annotations.push(...activeAnnotations);
    }

    return {
      unit: {
        data: unit.data,
        status: unit.status,
        annotations,
        token: JSON.stringify({ unitId: unit.id }),
      },
      phaseProgress: {
        nCoded: units.filter((unit) => unit.status === "done").length,
        nTotal: units.length,
        currentUnit: unit.index,
      },
    };
  }

  async postAnnotationsEndpoint(annotations: z.infer<typeof PostAnnotationUpdateSchema>[]) {
    if (!this.cookies.session) throw new Error("Session not initialized");
    const session = decryptSessionToken(this.cookies.session);

    // assume that annotations are sorted by when modified time (deleted || created)
    for (let { unitToken, annotation } of annotations) {
      const unitId = unitToken ? decryptUnitToken(unitToken).unitId : "global";
      const variableId = annotation.variableId;
      this.annotations[unitId][variableId] = this.annotations[unitId][variableId] || {
        status: "pending",
        annotations: {},
      };
      this.annotations[unitId][variableId].annotations[annotation.id] = annotation;

      if (annotation.finishVariable) this.annotations[unitId][variableId].done = true;
      if (annotation.type === "skip") this.annotations[unitId][variableId].skip = annotation.skip;
    }

    return true;
  }
}

interface Session {
  jobId: number;
  coderId: number;
  secret: string;
}
function encryptSessionToken(sessionToken: Session): string {
  // on real server we use the typesafeEncrypt
  return JSON.stringify(sessionToken);
}
function decryptSessionToken(token: string): Session {
  return JSON.parse(token);
}
interface UnitToken {
  unitId: number;
}
function encryptUnitToken(unitToken: UnitToken): string {
  return JSON.stringify(unitToken);
}
function decryptUnitToken(token: string): UnitToken {
  return JSON.parse(token);
}

function mockUnits(n: number) {
  return Array.from({ length: n }).map((_, i) => {
    return {
      id: i,
      data: { text: `This is unit ${i}` },
    };
  });
}

function computeProgress(phaseUnits: PhaseUnits, codebook: CodebookNode[], annotations: ServerAnnotations): Progress {
  // on real server this is much more efficient by joining leaf nodes to annotations table
  const phases = codebook.filter((node) => node.treeType === "phase");
  const progress: Progress = { phase: 0, phases: [], settings: { canSkip: false, canGoBack: true } };

  function phaseIsDone(phaseVariables: CodebookNode[], unitId: UnitId): boolean {
    for (let variable of phaseVariables) {
      const varAnno = annotations[unitId]?.[variable.id];
      if (!varAnno?.done && !varAnno.skip) return false;
    }
    return true;
  }

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const type = phase.phase;
    const label = phase.name.replaceAll("_", " ");

    // get the variables for this phase
    const phaseVariables = codebook.filter((node) => node.phaseId === phase.id);

    if (type === "survey") {
      progress.phases[i] = {
        type,
        label,
        status: phaseIsDone(phaseVariables, "global") ? "done" : "pending",
      };
    }

    if (type === "annotation") {
      const unitIds = phaseUnits[i].map((u) => u.id);
      const unitDone = unitIds.map((unitId) => phaseIsDone(phaseVariables, unitId));
      const nCoded = unitDone.filter((done) => done).length;
      const nTotal = unitIds.length;
      const currentUnit = unitIds.findIndex((unitId) => !unitDone[unitId]);
      const status = nCoded === nTotal ? "done" : "pending";
      progress.phases[i] = { type, label, status, nCoded, nTotal, currentUnit };
    }
  }

  return progress;
}

export default JobServerDesign;
