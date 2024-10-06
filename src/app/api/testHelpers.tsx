import z from "zod";
import { queryClient } from "@/drizzle/drizzle";
import { NextRequest } from "next/server";

export function disconnectDB() {
  // how to close depends on the client. "end" works for pg, but not for Neon (which shouldn't be used for testing)
  if ("end" in queryClient) queryClient.end();
}

export function MockGet<T>(schema: z.ZodType<T>, params?: T) {
  let url = "https://localhost:3000";
  if (params) url += "?" + new URLSearchParams(params as any).toString();
  const req = new Request(url, { method: "GET" });
  return new NextRequest(req);
}

export function MockPost<T>(schema: z.ZodType<T>, data?: T) {
  const body = data ? JSON.stringify(data) : null;
  const req = new Request("https://localhost:3000", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
  });
  return new NextRequest(req);
}
