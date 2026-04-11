import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthAPI,
  isAuthError,
} from "@/lib/auth/require-auth-api";

// PUT /api/fitness/exercises/reorder — reorder exercises within a day
// Body: { dayId: string, orderedIds: string[] }
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const body = await request.json();
    const { dayId, orderedIds } = body;

    if (!dayId)
      return NextResponse.json(
        { error: "dayId is required" },
        { status: 400 },
      );
    if (!Array.isArray(orderedIds))
      return NextResponse.json(
        { error: "orderedIds must be an array" },
        { status: 400 },
      );

    await Promise.all(
      orderedIds.map((id: string, index: number) =>
        supabase
          .from("exercises")
          .update({ display_order: index })
          .eq("id", id)
          .eq("user_id", user.id)
          .eq("day_id", dayId),
      ),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
