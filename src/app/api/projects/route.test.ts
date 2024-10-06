/**
 * @jest-environment node
 */
import * as projectsEndpoint from "./route";
import { queryClient } from "@/drizzle/drizzle";
import { NextRequest } from "next/server";
import { ProjectsCreateSchema, ProjectsResponseSchema } from "./schemas";
import { disconnectDB, MockGet, MockPost } from "../testHelpers";

afterAll(disconnectDB);

// TODO: see if we can just use the URL endpoints instead of importing the GET and POST
// This becomes tedious when testing combinations of endpoints
// or,  make a testPost and testGet function that takes the endpoint and the schema.

describe("POST and GET project", () => {
  const name = "test";
  let createdId = 0;

  it("POST /projects", async () => {
    const res = await projectsEndpoint.POST(MockPost(ProjectsCreateSchema, { name }));
    const body = await res.json();
    createdId = body.id;
    expect(res.status).toBe(200);
  });

  it("GET /projects", async () => {
    const res = await GET(MockGet(ProjectsResponseSchema));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id === createdId);
    expect(body.name === name);
  });
});
