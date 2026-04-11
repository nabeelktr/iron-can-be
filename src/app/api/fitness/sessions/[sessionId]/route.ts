import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthAPI,
  isAuthError,
} from "@/lib/auth/require-auth-api";

type Params = { params: Promise<{ sessionId: string }> };

// PUT /api/fitness/sessions/:sessionId — end a workout session
// Body: { durationSeconds, totalVolume, totalSets, mood?, notes? }
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;
    const { sessionId } = await params;

    const body = await request.json();

    const { error } = await supabase
      .from("workout_sessions")
      .update({
        ended_at: new Date().toISOString(),
        duration_seconds: body.durationSeconds,
        total_volume: body.totalVolume,
        total_sets: body.totalSets,
        mood: body.mood ?? null,
        notes: body.notes ?? null,
      })
      .eq("id", sessionId)
      .eq("user_id", user.id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
