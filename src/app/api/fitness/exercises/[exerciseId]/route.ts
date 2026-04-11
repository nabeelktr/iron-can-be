import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthAPI,
  isAuthError,
} from "@/lib/auth/require-auth-api";

type Params = { params: Promise<{ exerciseId: string }> };

// PUT /api/fitness/exercises/:exerciseId — update an exercise
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;
    const { exerciseId } = await params;

    const body = await request.json();
    const name = body.name?.trim();
    if (!name)
      return NextResponse.json(
        { error: "Exercise name is required" },
        { status: 400 },
      );

    const { error } = await supabase
      .from("exercises")
      .update({
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
      })
      .eq("id", exerciseId)
      .eq("user_id", user.id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/fitness/exercises/:exerciseId — delete an exercise
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;
    const { exerciseId } = await params;

    const { error } = await supabase
      .from("exercises")
      .delete()
      .eq("id", exerciseId)
      .eq("user_id", user.id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
