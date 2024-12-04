import { projects } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { eq } from "drizzle-orm";
import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet } from "@/app/api/routeHelpers";
import { NextRequest } from "next/server";
import {
  AnnotateUnitSchema,
  GetJobStateParamsSchema,
  GetJobStateResponseSchema,
  GetUnitParamsSchema,
} from "../schemas";
import { cookies } from "next/headers";

export async function GET(req: NextRequest, props: { params: Promise<{ jobId: number }> }) {
  const params = await props.params;
  const { jobId } = params;
  const cookieStore = await cookies();

  return createGet({
    selectFunction: async (email, urlParams) => {
      console.log(email, urlParams);
      return { test: "this" };
    },
    req,
    paramsSchema: GetJobStateParamsSchema,
    // responseSchema: GetJobStateResponseSchema,
    projectId: null,
    authorizeFunction: async (auth, params) => {
      return undefined;
    },
    authenticationRequired: false,
  });
}
