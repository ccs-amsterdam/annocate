import { PostAnnotationUpdateSchema } from "@/app/api/annotate/[jobId]/schemas";
import { AnnotationSchema } from "@/app/api/projects/[projectId]/annotations/schemas";
import {
  AnnotationDictionary,
  GetUnit,
  CodebookNode,
  JobServer,
  UnitDataResponse,
  Annotation,
  UnitData,
  Unit,
  GetSession,
  VariableStatus,
  PostAnnotationsResponse,
  ProgressState,
} from "@/app/types";
import { prepareCodebookState } from "@/functions/codebookPhases";
import { MiddlecatUser } from "middlecat-react";
import { z } from "zod";

interface MockServerConstructor {
  codebook: CodebookNode[];
  units?: UnitDataResponse[];
  annotations?: ServerAnnotations;
}

interface JobServerDesign extends JobServer {
  projectId: number;
  user: MiddlecatUser;
  mockServer: MockServer;
  codebookNodes: CodebookNode[];
  previewMode: boolean;
}

interface ServerUnit {
  index: number;
  id: number;
  data: UnitData;
  done: boolean;
}
type PhaseUnits = Record<number, ServerUnit[]>;

type UnitId = number | "global";

type VariableId = number;
export type ServerAnnotations = Record<UnitId, Record<VariableId, AnnotationDictionary>>;

export class MockServer {
  annotations: ServerAnnotations;
  codebook: CodebookNode[];
  phaseUnits: PhaseUnits;

  constructor({ codebook, units, annotations }: MockServerConstructor) {
    this.codebook = codebook;
    this.annotations = annotations || { global: {} };

    // this at some point needs to respect settings from the annotation phase.
    // Now it just uses all units. Also, maybe use phase ids instead of indices
    this.phaseUnits = {};
    const phases = codebook.filter((node) => node.treeType === "phase");
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      if (phase.phaseType === "annotation") {
        this.phaseUnits[i] = (units ?? mockUnits(10)).map((unit, index) => ({
          index: index,
          id: unit.id,
          data: unit.data,
          done: false,
        }));
      }
    }
  }

  async getSession(): Promise<GetSession> {
    //
    // !!!! at the start of the session create a random secret (keep in jobAnnotator)
    // this secret is included in the jobToken, which is added as a http-only cookie
    // All the codes in the codebook are given an encrpted token using this secret
    // for validation information:
    // - hash of the code and value
    // - gold boolean
    // The phase can also have a token that encrypts:
    // - required variables

    const globalAnnotations = Object.values(this.annotations["global"]).flatMap((variable) => variable.annotations);

    return {
      sessionToken: encryptSessionToken({ jobId: 0, coderId: 0, secret: "secret" }),
      phaseProgress: computePhaseProgress(this.phaseUnits, this.codebook, this.annotations),
      codebook: this.codebook,
      globalAnnotations,
    };
  }

  async getUnitEndpoint(phaseNumber: number, unitIndex?: number): Promise<GetUnit | null> {
    const units = this.phaseUnits[phaseNumber];
    if (!units) throw new Error("Invalid phase number (client problem");
    if (units.length === 0) throw new Error("No units in phase (job problem)");

    const unit = unitIndex ? units[unitIndex] : units.find((unit) => !unit.done);
    if (!unit) throw new Error("Invalid unit index (client problem)");

    const annotations: Annotation[] = [];
    const variableAnnotations = Object.values(this.annotations[unit.id] || {});
    for (let va of variableAnnotations) {
      const activeAnnotations = Object.values(va)
        .filter((a) => !a.deleted)
        .sort((a, b) => a.created.getTime() - b.created.getTime());
      annotations.push(...activeAnnotations);
    }

    return {
      unit: {
        data: unit.data,
        done: unit.done,
        annotations,
        token: encryptUnitToken({ unitId: unit.id }),
      },
    };
  }

  async postAnnotationsEndpoint({
    sessionToken,
    phaseAnnotations,
  }: z.infer<typeof PostAnnotationUpdateSchema>): Promise<PostAnnotationsResponse> {
    const session = decryptSessionToken(sessionToken);

    // assume that annotations are sorted by when modified time (deleted || created)
    for (let [phaseToken, annotations] of Object.entries(phaseAnnotations)) {
      const sortedAnnotations = annotations.sort((a, b) => {
        const updatedA = a.deleted ?? a.created;
        const updatedB = b.deleted ?? b.created;
        return updatedA.getTime() - updatedB.getTime();
      });

      for (let annotation of sortedAnnotations) {
        const unitId = phaseToken ? decryptUnitToken(phaseToken).unitId : "global";
        const variableId = annotation.variableId;
        this.annotations[unitId][variableId] = this.annotations[unitId][variableId] || {
          status: "pending",
          annotations: {},
        };
        this.annotations[unitId][variableId][annotation.id] = annotation;
      }
    }

    return {
      sessionToken: encryptSessionToken(session),
    };
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

function computePhaseProgress(
  phaseUnits: PhaseUnits,
  codebook: CodebookNode[],
  annotations: ServerAnnotations,
): GetSession["phaseProgress"] {
  // on real server we can do this much more efficiently with SQL

  const phases = codebook.filter((node) => node.treeType === "phase");
  const progress: GetSession["phaseProgress"] = [];

  function variableIsDoneOrSkipped(annotations: Annotation[]): boolean {
    return annotations.some((a) => {
      if (a.deleted) return false;
      if (a.finishVariable && a.finishLoop) return true;
      return false;
    });
  }

  function phaseIsDone(phaseVariables: CodebookNode[], unitId: UnitId): boolean {
    for (let variable of phaseVariables) {
      const annotationDict = annotations[unitId]?.[variable.id];
      if (!annotationDict) return false;
      return variableIsDoneOrSkipped(Object.values(annotationDict));
    }
    return true;
  }

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const type = phase.phaseType;
    const label = phase.name.replaceAll("_", " ");

    // get the variables for this phase
    const phaseVariables = codebook.filter((node) => node.phaseId === phase.id && node.treeType === "leaf");

    if (type === "survey") {
      progress.push({
        phaseId: phase.id,
        unitsDone: [phaseIsDone(phaseVariables, "global")],
      });
    }

    if (type === "annotation") {
      const unitIds = phaseUnits[i].map((u) => u.id);
      const unitsDone = unitIds.map((unitId) => phaseIsDone(phaseVariables, unitId));
      progress.push({
        phaseId: phase.id,
        unitsDone,
      });
    }
  }

  return progress;
}
