import { NextResponse, type NextRequest } from "next/server";
import {
  requireTrainerAPI,
  isTrainerError,
} from "@/lib/auth/require-trainer-api";

// GET /api/trainer/alerts — summary of at-risk clients.
// Thin wrapper around /api/trainer/clients that returns counts + flagged clients.
// Used by TrainerDashboardScreen for the at-risk banner.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireTrainerAPI(request);
    if (isTrainerError(auth)) return auth;

    // Delegate to the clients endpoint logic by hitting the same data path.
    // Rather than duplicate the adherence math, call out to our own route via fetch.
    // Next.js runs routes in-process; this is fine performance-wise for a dashboard.
    const origin = new URL(request.url).origin;
    const upstream = await fetch(`${origin}/api/trainer/clients`, {
      headers: {
        // Forward the Authorization header so requireTrainerAPI re-authenticates
        Authorization: request.headers.get("Authorization") ?? "",
      },
    });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Failed to compute alerts" },
        { status: upstream.status },
      );
    }
    const body = (await upstream.json()) as {
      clients: Array<{
        user_id: string;
        display_name: string | null;
        email: string;
        flag: "no_log" | "low_adherence" | null;
        days_since_last_log: number | null;
        adherence_7d: number | null;
      }>;
    };

    const flagged = body.clients.filter((c) => c.flag !== null);
    const noLog = flagged.filter((c) => c.flag === "no_log");
    const lowAdherence = flagged.filter((c) => c.flag === "low_adherence");

    return NextResponse.json({
      total_flagged: flagged.length,
      no_log_count: noLog.length,
      low_adherence_count: lowAdherence.length,
      clients: flagged.slice(0, 20),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
