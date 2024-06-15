import { NextResponse } from "next/server";

// GET /api/config

export async function GET() {
  const config = {
    middlecat_url: process.env.MIDDLECAT_URL || "",
    authorization: process.env.AUTH_DISABLED === "true" ? "no_auth" : "authenticated",
  };

  return NextResponse.json(config, {
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  });
}
