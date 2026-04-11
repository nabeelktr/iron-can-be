import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthAPI,
  isAuthError,
} from "@/lib/auth/require-auth-api";
import type { ExerciseLog } from "@/types/fitness";

// POST /api/fitness/logs/previous — fetch most recent (non-today) log per exercise
// Body: { exerciseIds: string[] }
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const body = await request.json();
    const { exerciseIds } = body;

    if (!Array.isArray(exerciseIds))
      return NextResponse.json(
        { error: "exerciseIds must be an array" },
        { status: 400 },
      );

    if (exerciseIds.length === 0)
      return NextResponse.json({});

    const today = new Date().toISOString().split("T")[0];

    const { data: logs } = await supabase
      .from("exercise_logs")
      .select(
        "id, exercise_id, completed_sets, completed_reps, weight_used, time_spent, sets, date, exercise_snapshot",
      )
      .in("exercise_id", exerciseIds)
      .eq("user_id", user.id)
      .lt("date", today)
      .order("date", { ascending: false });

    if (!logs) return NextResponse.json({});

    // Group by exercise_id, keep only the most recent per exercise
    const result: Record<string, ExerciseLog> = {};
    for (const log of logs) {
      if (log.exercise_id && !result[log.exercise_id]) {
        result[log.exercise_id] = log as unknown as ExerciseLog;
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
