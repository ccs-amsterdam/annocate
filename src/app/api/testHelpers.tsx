import z from "zod";
import { queryClient } from "@/drizzle/drizzle";
import { NextRequest, NextResponse } from "next/server";

export function disconnectDB() {
  // how to close depends on the client. "end" works for pg, but not for Neon (which shouldn't be used for testing)
  if ("end" in queryClient) queryClient.end();
}

type NextEndpointMethod<Params> = (req: NextRequest, { params }: { params: Params }) => Promise<NextResponse<any>>;

export async function TestGET<Params, Query>(
  endpoint: { GET: NextEndpointMethod<Params> },
  params: Params,
  schema?: z.ZodType<Query>,
  query?: Query,
) {
  if (!endpoint.GET) throw new Error("GET not implemented");
  let url = "https://localhost:3000";
  if (query) url += "?" + new URLSearchParams(query as any).toString();
  const req = new Request(url, { method: "GET" });
  const nextReq = new NextRequest(req);
  return endpoint.GET(nextReq, { params });
}

export async function TestPOST<Params, Data>(
  endpoint: { POST: NextEndpointMethod<Params> },
  params: Params,
  schema?: z.ZodType<Data>,
  data?: Data,
) {
  const body = data ? JSON.stringify(data) : null;
  const req = new Request("https://localhost:3000", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
  });
  const nextReq = new NextRequest(req);
  return endpoint.POST(nextReq, { params });
}
