import { JobServer, PostAnnotationsResponse, PostAnnotation } from "@/app/types";
import { MiddlecatUser } from "middlecat-react";
import { MockServer } from "./MockServer";

interface JobServerDesignConstructor {
  projectId: number;
  jobId: number;

  user: MiddlecatUser;
  mockServer: MockServer;
  useRealUnits?: boolean;

  previewMode?: boolean;
}

class JobServerDesign implements JobServer {
  jobId: number;
  userId: string;

  // The following properties are only for the Design implementation
  projectId: number;
  user: MiddlecatUser;
  mockServer: MockServer;
  previewMode: boolean;

  // reimplement this later. Now use mockServer instead
  // reimplement this in a general JobServer class that JobServerDesign inherits
  // cache: JobServer["cache"];

  constructor({ jobId, user, projectId, mockServer, previewMode }: JobServerDesignConstructor) {
    this.mockServer = mockServer;
    this.jobId = jobId;
    this.userId = user.email;
    this.projectId = projectId;
    this.user = user;
    this.previewMode = !!previewMode;
  }

  async getSession() {
    return this.mockServer.getSession();
  }

  // TODO: create a general jobserver class, that implements getUnit and such.
  // The only thing that inheriting classes need to implement is the part that
  // performs the actual fetch. So basically what is now in server_getUnit and server_postAnnotations
  async getUnit(phaseNumber: number, unitIndex?: number) {
    return await this.mockServer.getUnitEndpoint(phaseNumber, unitIndex);
  }

  async postAnnotations(postAnnotation: PostAnnotation): Promise<PostAnnotationsResponse> {
    return await this.mockServer.postAnnotationsEndpoint(postAnnotation);
  }
}

export default JobServerDesign;
