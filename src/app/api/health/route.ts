import { NextResponse } from "next/server";

// GET /api/health — health check endpoint
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "ironcan-be",
    timestamp: new Date().toISOString(),
  });
}
