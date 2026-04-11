import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthAPI,
  isAuthError,
} from "@/lib/auth/require-auth-api";

// POST /api/fitness/logs — log an exercise (full log with sets/reps/weight)
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

    // Fetch exercise with day/plan for snapshot
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
        completed_sets: body.completed_sets ?? 0,
        completed_reps: body.completed_reps ?? 0,
        weight_used: body.weight_used ?? null,
        time_spent: body.time_spent ?? null,
        sets: body.sets ?? [],
        notes: body.notes?.trim() || null,
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
