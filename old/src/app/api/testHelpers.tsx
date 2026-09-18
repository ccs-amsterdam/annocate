import z from "zod";
import { NextRequest, NextResponse } from "next/server";

import * as apiProjects from "@/app/api/projects/route";
import * as apiUnits from "@/app/api/projects/[projectId]/jobs/[jobId]/units/route";
import * as apiJob from "@/app/api/projects/[projectId]/jobs/route";
import { ProjectsCreateSchema } from "./projects/schemas";
import { UnitDataCreateBodySchema } from "./projects/[projectId]/jobs/[jobId]/units/schemas";
import { JobCreateSchema } from "./projects/[projectId]/jobs/schemas";

type NextEndpointMethod<Params> = (req: NextRequest, { params }: { params: Params }) => Promise<NextResponse<any>>;

export async function testGET<Params>(
  endpoint: { GET: NextEndpointMethod<Params> },
  params: Params,
  query?: Record<string, any>,
) {
  if (!endpoint.GET) throw new Error("GET not implemented");
  let url = "https://localhost:3000";
  if (query) url += "?" + new URLSearchParams(query as any).toString();
  const req = new Request(url, { method: "GET" });
  const nextReq = new NextRequest(req);
  return endpoint.GET(nextReq, { params });
}

export async function testPOST<Params, Data>(
  endpoint: { POST: NextEndpointMethod<Promise<Params>> },
  params: Params,
  data?: Record<string, any>,
) {
  const body = data ? JSON.stringify(data) : null;
  const req = new Request("https://localhost:3000", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
  });
  const nextReq = new NextRequest(req);
  return endpoint.POST(nextReq, { params: Promise.resolve(params) });
}

export async function createTestProject(query: z.infer<typeof ProjectsCreateSchema>) {
  return testPOST(apiProjects, {}, query);
}
export async function createTestJob(projectId: number, body: z.infer<typeof JobCreateSchema>) {
  return testPOST(apiJob, { projectId: String(projectId) }, body);
}
export async function createTestUnits(
  projectId: number,
  jobId: number,
  body: z.infer<typeof UnitDataCreateBodySchema>,
) {
  return testPOST(apiUnits, { projectId: String(projectId), jobId: String(jobId) }, body);
}
// export async function createTestCodebook(projectId: number, body: z.infer<typeof CodebookCreateBodySchema>) {
//   return testPOST(apiCodebooks, { projectId }, body);
// }

// maybe create a separate tests folder, and inside there just test the whole job creation flow, instead of going per endpoint
