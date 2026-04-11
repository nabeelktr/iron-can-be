import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthAPI,
  isAuthError,
} from "@/lib/auth/require-auth-api";

// POST /api/fitness/sessions — start a workout session
// Body: { planId: string, dayId: string }
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const body = await request.json();
    const { planId, dayId } = body;

    if (!planId || !dayId)
      return NextResponse.json(
        { error: "planId and dayId are required" },
        { status: 400 },
      );

    const { data, error } = await supabase
      .from("workout_sessions")
      .insert({
        user_id: user.id,
        plan_id: planId,
        day_id: dayId,
      })
      .select("id")
      .single();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ id: data?.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
