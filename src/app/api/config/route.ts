import { NextResponse } from "next/server";

// GET /api/config

export async function GET() {
  const config = {
    middlecat_url: process.env.MIDDLECAT_URL || "",
    authorization:
      process.env.MIDDLECAT_URL === "DEVMODE" || process.env.TEST_MODE === "true" ? "no_auth" : "authenticated",
  };

  return NextResponse.json(config, {
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  });
}
