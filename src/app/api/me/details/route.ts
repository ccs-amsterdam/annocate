import { NextResponse } from "next/server";

import { authenticateUser, userDetails } from "@/app/api/authorization";

export async function GET(req: Request) {
  const email = await authenticateUser(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json(await userDetails(email));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
