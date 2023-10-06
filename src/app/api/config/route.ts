import { NextResponse } from "next/server";

// GET /api/config

export async function GET() {
  const config = {
    middlecat_url: "https://middlecat.up.railway.app",
    authorization: "authenticated",
  };

  return NextResponse.json(config, {
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  });
}
