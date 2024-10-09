/**
 * @jest-environment node
 */
import * as apiProjects from "./route";
import * as apiProjectId from "./[projectId]/route";
import { ProjectsCreateSchema } from "./schemas";
import { disconnectDB, TestGET, TestPOST } from "../testHelpers";

afterAll(disconnectDB);

describe("Project endpoints", () => {
  const name = "test";
  let createdId = 0;

  it("POST /projects", async () => {
    const res = await TestPOST(apiProjects, undefined, ProjectsCreateSchema, { name });
    expect(res.status).toBe(200);

    const body = await res.json();
    createdId = body.id;
  });

  it("GET /projects", async () => {
    const res = await TestGET(apiProjects, undefined);
    expect(res.status).toBe(200);

    const body = await res.json();
    const project = body.data.find((p: any) => p.id === createdId);
    expect(project).toBeDefined();
    expect(project.name).toBe(name);
  });

  it("GET /projects/projectId", async () => {
    const res = await TestGET(apiProjectId, { projectId: createdId });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.id).toBe(createdId);
    expect(body.name).toBe(name);
  });
});
