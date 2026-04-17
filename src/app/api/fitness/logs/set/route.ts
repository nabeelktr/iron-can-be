import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthAPI,
  isAuthError,
} from "@/lib/auth/require-auth-api";
import type { ExerciseSet } from "@/types/fitness";

// POST /api/fitness/logs/set — log a single set (creates or updates today's log)
// Body: { exerciseId: string, setIndex: number, setData: ExerciseSet }
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const body = await request.json();
    const { exerciseId, setIndex, setData } = body;

    if (!exerciseId)
      return NextResponse.json(
        { error: "exerciseId is required" },
        { status: 400 },
      );
    if (setIndex === undefined || setIndex === null)
      return NextResponse.json(
        { error: "setIndex is required" },
        { status: 400 },
      );
    if (!setData)
      return NextResponse.json(
        { error: "setData is required" },
        { status: 400 },
      );

    const today = new Date().toISOString().split("T")[0];

    // Check for existing log today
    const { data: existingLog, error: fetchError } = await supabase
      .from("exercise_logs")
      .select("*")
      .eq("exercise_id", exerciseId)
      .eq("user_id", user.id)
      .eq("date", today)
      .single();

    if (fetchError && fetchError.code !== "PGRST116")
      return NextResponse.json(
        { error: fetchError.message },
        { status: 500 },
      );

    if (!existingLog) {
      // Create new log with this set
      const { data: exercise } = await supabase
        .from("exercises")
        .select("*, day:workout_days(name, plan:workout_plans(name))")
        .eq("id", exerciseId)
        .single();

      if (!exercise)
        return NextResponse.json(
          { error: "Exercise not found" },
          { status: 404 },
        );

      const day = exercise.day as {
        name: string;
        plan: { name: string };
      } | null;

      const { data: newLog, error: insertError } = await supabase
        .from("exercise_logs")
        .insert({
          exercise_id: exerciseId,
          user_id: user.id,
          date: today,
          exercise_snapshot: {
            name: exercise.name,
            target_sets: exercise.target_sets,
            target_reps: exercise.target_reps,
            weight: exercise.weight,
            time_seconds: exercise.time_seconds,
            rest_time: exercise.rest_time,
            muscle_group: exercise.muscle_group,
            category: exercise.category,
            day_name: day?.name ?? "",
            plan_name: day?.plan?.name ?? "",
          },
          completed_sets: 1,
          completed_reps: setData.reps,
          weight_used: setData.weight,
          sets: [setData],
        })
        .select()
        .single();

      if (insertError)
        return NextResponse.json(
          { error: insertError.message },
          { status: 500 },
        );

      return NextResponse.json(newLog);
    } else {
      // Update existing log with new set
      const sets = existingLog.sets || [];
      sets[setIndex] = setData;

      const { data: updatedLog, error } = await supabase
        .from("exercise_logs")
        .update({
          sets,
          completed_sets: sets.length,
          completed_reps: sets[sets.length - 1].reps,
          weight_used:
            Math.max(...sets.map((s: ExerciseSet) => s.weight ?? 0)) || null,
        })
        .eq("id", existingLog.id)
        .select()
        .single();

      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json(updatedLog);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
