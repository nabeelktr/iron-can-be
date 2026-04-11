import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthAPI,
  isAuthError,
} from "@/lib/auth/require-auth-api";

type Params = { params: Promise<{ dayId: string }> };

// PUT /api/fitness/days/:dayId — update day name
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;
    const { dayId } = await params;

    const body = await request.json();
    const name = body.name?.trim();
    if (!name)
      return NextResponse.json(
        { error: "Day name is required" },
        { status: 400 },
      );

    const { error } = await supabase
      .from("workout_days")
      .update({ name })
      .eq("id", dayId)
      .eq("user_id", user.id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/fitness/days/:dayId — delete a day
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;
    const { dayId } = await params;

    const { error } = await supabase
      .from("workout_days")
      .delete()
      .eq("id", dayId)
      .eq("user_id", user.id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
