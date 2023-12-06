import { NextResponse } from "next/server";
import { users } from "@/drizzle/schema";
import db from "@/drizzle/schema";

import { eq } from "drizzle-orm";

import { authenticateUser } from "@/functions/authorization";

export const runtime = "edge";

export interface UsersMeGetResponse {
  admin: boolean;
  createJob: boolean;
}

export async function GET(req: Request) {
  const email = await authenticateUser(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    if (email === process.env.SUPERADMIN) {
      const res: UsersMeGetResponse = { admin: true, createJob: true };
      return NextResponse.json(res);
    }

    const [user] = await db.select().from(users).where(eq(users.email, email));

    const res: UsersMeGetResponse = user
      ? { admin: user.isAdmin, createJob: user.canCreateJob }
      : { admin: false, createJob: false };

    return NextResponse.json(res);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
