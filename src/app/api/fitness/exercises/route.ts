import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthAPI,
  isAuthError,
} from "@/lib/auth/require-auth-api";

// POST /api/fitness/exercises — create an exercise in a day
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const body = await request.json();
    const { dayId } = body;
    const name = body.name?.trim();

    if (!dayId)
      return NextResponse.json(
        { error: "dayId is required" },
        { status: 400 },
      );
    if (!name)
      return NextResponse.json(
        { error: "Exercise name is required" },
        { status: 400 },
      );

    const { data: existing } = await supabase
      .from("exercises")
      .select("display_order")
      .eq("day_id", dayId)
      .order("display_order", { ascending: false })
      .limit(1);

    const nextOrder =
      existing && existing.length > 0 ? existing[0].display_order + 1 : 0;

    const { data, error } = await supabase
      .from("exercises")
      .insert({
        day_id: dayId,
        user_id: user.id,
        name,
        target_sets: body.target_sets ?? 3,
        target_reps: body.target_reps ?? 10,
        weight: body.weight ?? null,
        time_seconds: body.time_seconds ?? null,
        rest_time: body.rest_time ?? null,
        is_stepper: body.is_stepper ?? false,
        muscle_group: body.muscle_group ?? "other",
        category: body.category ?? "strength",
        notes: body.notes?.trim() || null,
        display_order: nextOrder,
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
