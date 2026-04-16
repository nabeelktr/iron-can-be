import { NextResponse, type NextRequest } from "next/server";
import {
  requireTrainerAPI,
  isTrainerError,
} from "@/lib/auth/require-trainer-api";

// GET /api/trainer/upgrade-requests — list upgrade requests for this trainer
export async function GET(request: NextRequest) {
  try {
    const auth = await requireTrainerAPI(request);
    if (isTrainerError(auth)) return auth;
    const { supabase, profile } = auth;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending";

    let query = supabase
      .from("upgrade_requests")
      .select("*, user:user_profiles!upgrade_requests_user_id_fkey(*)")
      .eq("requested_trainer_id", profile.id)
      .order("created_at", { ascending: false });

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data: requests, error } = await query;

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(requests ?? []);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
