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
  UnitStatus,
  UnitData,
  Unit,
} from "@/app/types";
import { getCodebookPhases } from "@/functions/codebookPhases";
import { MiddlecatUser } from "middlecat-react";
import { z } from "zod";

interface MockServer {
  units: Record<number, { data: UnitData; status: UnitStatus }>;
  annotations: Record<number | "global", z.infer<typeof AnnotationSchema>[]>;
  progress: Progress;
}

interface JobServerDesignConstructor {
  projectId: number;
  jobId: number;

  user: MiddlecatUser;
  mockServer: MockServer;
  codebookNodes: CodebookNode[];
  useRealUnits?: boolean;

  previewMode?: boolean;
}

class JobServerDesign implements JobServer {
  jobId: number;
  userId: string;
  initialized: boolean;
  jobToken: string;

  // The following properties are only for the Design implementation
  projectId: number;
  user: MiddlecatUser;
  mockServer: MockServer;
  codebookNodes: CodebookNode[];
  previewMode: boolean;

  // reimplement this later. Now use mockServer instead
  // reimplement this in a general JobServer class that JobServerDesign inherits
  // cache: JobServer["cache"];

  constructor({ jobId, user, projectId, mockServer, codebookNodes, previewMode }: JobServerDesignConstructor) {
    this.mockServer = mockServer;
    this.codebookNodes = codebookNodes;
    this.jobToken = "uninitialized";

    this.jobId = jobId;
    this.userId = user.email;
    this.initialized = false;

    this.projectId = projectId;
    this.user = user;

    this.previewMode = !!previewMode;
  }

  async init() {
    const jobState = await this.getJobState();

    this.jobToken = jobState.jobToken;
    this.initialized = true;

    return {
      codebook: await this.getCodebook(),
      jobState,
    };
  }

  async getJobState() {
    return {
      jobToken: JSON.stringify({ jobId: 0, coderId: 0 }),
      progress: computeProgress(this.mockServer, this.codebookNodes),
      globalAnnotations: this.mockServer.annotations["global"],
    };
  }

  async getCodebook(): Promise<CodebookNode[]> {
    return this.codebookNodes;
  }

  // TODO: create a general jobserver class, that implements getUnit and such.
  // The only thing that inheriting classes need to implement is the part that
  // performs the actual fetch. So basically what is now in server_getUnit and server_postAnnotations
  async getUnit(phaseNumber?: number, unitIndex?: number) {
    if (!this.initialized) throw new Error("JobServer not initialized");
    return await this.server_getUnit(phaseNumber, unitIndex);
  }

  async postAnnotations(
    unitToken: string | null,
    add: AnnotationDictionary,
    rmIds: string[],
    status: Status,
  ): Promise<Status> {
    if (!this.initialized) throw new Error("JobServer not initialized");

    return await this.server_postAnnotations(this.jobToken, unitToken, add, rmIds, status);
  }

  async server_postAnnotations(
    jobToken: string,
    unitToken: string | null,
    add: AnnotationDictionary,
    rmIds: string[],
    status: Status,
  ): Promise<Status> {
    if (!this.initialized) throw new Error("JobServer not initialized");

    const pJobToken = JSON.parse(jobToken);
    if (pJobToken.jobId !== 0 || pJobToken.coderId !== 0) throw new Error("Invalid jobToken");

    const unitId = unitToken ? JSON.parse(unitToken).key : null;

    // update annotations
    const key = unitId ?? "global";
    let annotations = this.mockServer.annotations[key];
    annotations = annotations.filter((a) => !rmIds.includes(a.id));
    annotations = [...annotations, ...Object.values(add)];
    this.mockServer.annotations[key] = annotations;

    // update unit status
    if (unitId !== null) {
      this.mockServer.units[unitId].status = status;
    }

    return status;
  }
}

function fakeUnit(i: number): UnitDataResponse {
  return {
    id: "unit" + i,
    data: { text: `This is unit ${i}` },
  };
}

function computeProgress(mockServer: MockServer, codebook: CodebookNode[]): Progress {
  const nTotal = Object.keys(mockServer.units).length;

  const codebookPhases = getCodebookPhases(codebook);
  const progress: Progress = {
    phase: 0,
    phasesCoded: 0,
    settings: {
      canGoBack: true,
      canSkip: false,
    },
    phases: codebookPhases.map((phase) => {
      const type = phase.type;
      const label = phase.label;
      const variables = phase.variables.map((variable) => ({
        name: variable.name,
        status: "pending" as const,
      }));

      if (type === "survey") {
        return { type, label, variables };
      } else {
        const unitProgress = { nCoded: 0, nTotal, currentUnit: 0 };
        return { type, label, variables, ...unitProgress };
      }
    }),
  };

  return progress;
}

function clientSideAnnotations(annotations: z.infer<typeof AnnotationSchema>[]): Annotation[] {
  // On the client the annotations include some temporary properties
  return annotations.map((a) => ({ ...a, client: {} }));
}

export default JobServerDesign;
