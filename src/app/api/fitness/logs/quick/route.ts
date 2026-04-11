import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthAPI,
  isAuthError,
} from "@/lib/auth/require-auth-api";

// POST /api/fitness/logs/quick — quick log using last workout's stats
// Body: { exerciseId: string }
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const body = await request.json();
    const { exerciseId } = body;

    if (!exerciseId)
      return NextResponse.json(
        { error: "exerciseId is required" },
        { status: 400 },
      );

    const { data: exercise } = await supabase
      .from("exercises")
      .select("*, day:workout_days(name, plan:workout_plans(name))")
      .eq("id", exerciseId)
      .eq("user_id", user.id)
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

    // Fetch last log for this exercise
    const { data: lastLog } = await supabase
      .from("exercise_logs")
      .select("completed_sets, completed_reps, weight_used, time_spent")
      .eq("exercise_id", exerciseId)
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(1)
      .single();

    const snapshot = {
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
    };

    const { data, error } = await supabase
      .from("exercise_logs")
      .insert({
        exercise_id: exerciseId,
        user_id: user.id,
        date: new Date().toISOString().split("T")[0],
        exercise_snapshot: snapshot,
        completed_sets: lastLog?.completed_sets ?? exercise.target_sets,
        completed_reps: lastLog?.completed_reps ?? exercise.target_reps,
        weight_used: lastLog?.weight_used ?? exercise.weight,
        time_spent: lastLog?.time_spent ?? exercise.time_seconds,
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
