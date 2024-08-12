import { NextResponse } from "next/server";

import { authenticateUser, authorization } from "@/app/api/authorization";

export async function GET(req: Request) {
  const email = await authenticateUser(req);

  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json(await authorization(email));
  } catch (e: any) {
    return NextResponse.json({ error: e.error || e.message }, { status: 400 });
  }
}
